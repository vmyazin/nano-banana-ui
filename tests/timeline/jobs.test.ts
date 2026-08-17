import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetJobsForTests,
  cancelJob,
  createJob,
  enqueue,
  getJob,
  hasCapacity,
  sweepAbandoned,
  TooBusyError,
  type JobRunner,
  type RenderJob,
} from '../../lib/timeline/jobs';
import type { RenderProgress } from '../../lib/timeline/render/port';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'jobs-test-'));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A runner that reports one progress tick, then waits on a caller-controlled gate. */
function makeGatedRunner() {
  const calls: RenderJob[] = [];
  const progressSeen: RenderProgress[] = [];
  const gate = deferred<{ outputPath: string }>();
  const runner: JobRunner = async (job, ctx) => {
    calls.push(job);
    const onAbort = () => gate.reject(new Error('aborted'));
    ctx.signal.addEventListener('abort', onAbort);
    ctx.onProgress({ phase: 'encoding', completed: 0.5 });
    progressSeen.push({ phase: 'encoding', completed: 0.5 });
    try {
      return await gate.promise;
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
    }
  };
  return { runner, calls, progressSeen, resolve: gate.resolve, reject: gate.reject };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Waits until the registry has genuinely released every slot.
 *
 * `runOne` sets a job's terminal phase *before* its `finally` awaits temp-dir
 * cleanup and decrements `runningCount`, so a test that waits only for
 * `phase === 'done'` can return while the registry still counts that job as
 * running. Under load that pending `finally` lands inside whatever test comes
 * next — which, if that test asserts on capacity, fails it for reasons in an
 * earlier one. The epoch guard in `__resetJobsForTests` makes such a landing
 * harmless to the counter; this makes the tests stop producing them at all.
 */
async function awaitQuiescence(): Promise<void> {
  await waitUntil(() => hasCapacity());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const tempDirs: string[] = [];

function trackedTempDir(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  __resetJobsForTests();
});

afterEach(() => {
  __resetJobsForTests();
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('jobs registry — concurrency', () => {
  it('runs one job at a time and rejects a fourth enqueue as busy', async () => {
    const job1 = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const job2 = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const job3 = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const job4 = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });

    const r1 = makeGatedRunner();
    const r2 = makeGatedRunner();
    const r3 = makeGatedRunner();
    const r4 = makeGatedRunner();

    enqueue(job1.id, r1.runner);
    enqueue(job2.id, r2.runner);
    enqueue(job3.id, r3.runner);

    await waitUntil(() => r1.calls.length === 1);
    // Only the running slot's runner has actually been invoked; the other two
    // accepted jobs sit queued without their runner called yet.
    expect(r2.calls).toHaveLength(0);
    expect(r3.calls).toHaveLength(0);

    expect(() => enqueue(job4.id, r4.runner)).toThrow(TooBusyError);
    expect(r4.calls).toHaveLength(0);

    // Let the running job finish; the next queued one should start.
    r1.resolve({ outputPath: '/out/1.mp4' });
    await waitUntil(() => r2.calls.length === 1);
    expect(getJob(job1.id, 'a')?.phase).toBe('done');

    r2.resolve({ outputPath: '/out/2.mp4' });
    await waitUntil(() => r3.calls.length === 1);
    r3.resolve({ outputPath: '/out/3.mp4' });
    await waitUntil(() => getJob(job3.id, 'a')?.phase === 'done');
    // Wait for the slot to actually come back, not just for the phase flag.
    // `runOne` flips the phase before its `finally` awaits temp-dir cleanup,
    // so a test that stops at 'done' can hand a still-occupied counter to the
    // next one. See `awaitQuiescence`.
    await awaitQuiescence();
  });
});

describe('capacity is derived, not counted', () => {
  it('refuses to queue the same job twice, so one id is always one slot', () => {
    // Capacity comes from `active`, a set. Two waiting entries sharing an id
    // would occupy two queue slots but only one set membership, understating
    // how busy the box is — so the duplicate is refused outright.
    const job = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    enqueue(job.id, makeGatedRunner().runner);
    expect(() => enqueue(job.id, makeGatedRunner().runner)).toThrow(/already queued or running/);
  });

  it('never reports more room than the queue actually has', async () => {
    // The failure this replaces always looked the same: capacity reading
    // higher than reality. Asserted directly rather than via its symptom.
    const first = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const gate = makeGatedRunner();
    enqueue(first.id, gate.runner);
    await waitUntil(() => gate.calls.length === 1);
    expect(hasCapacity()).toBe(true);

    const rest = [0, 1].map(() => createJob({ sessionToken: 'a', tempDir: trackedTempDir() }));
    const gates = rest.map(() => makeGatedRunner());
    rest.forEach((job, index) => enqueue(job.id, gates[index].runner));
    expect(hasCapacity()).toBe(false);

    // A completion frees exactly one slot — never more. Proven by refilling
    // it: the replacement fits, and a second one does not.
    gate.resolve({ outputPath: '/out/a.mp4' });
    await waitUntil(() => getJob(first.id, 'a')?.phase === 'done');
    expect(hasCapacity()).toBe(true);

    const replacement = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    enqueue(replacement.id, makeGatedRunner().runner);
    expect(hasCapacity()).toBe(false);
    const overflow = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    expect(() => enqueue(overflow.id, makeGatedRunner().runner)).toThrow(TooBusyError);

    gates.forEach((g) => g.resolve({ outputPath: '/out/x.mp4' }));
    await waitUntil(() => getJob(rest[1].id, 'a')?.phase === 'done');
    await awaitQuiescence();
    expect(hasCapacity()).toBe(true);
  });
});

describe('jobs registry — resetting while a runner is still in flight', () => {
  it('does not let a stale completion drive runningCount negative and invent capacity', async () => {
    // The registry is a process-wide singleton, so a test that leaves a job
    // running hands its `runOne` to whatever runs next. Before the epoch
    // guard, that runner's `finally` decremented a counter the reset had
    // already zeroed — leaving it at -1, so `hasCapacity()` reported room
    // that did not exist and a *later* test failed for reasons in an earlier
    // one. That is the shape of an intermittent suite failure, so it is
    // pinned here rather than left to be rediscovered.
    const job = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);

    __resetJobsForTests();

    // The abandoned runner settles afterwards, as it would across a test
    // boundary.
    r.resolve({ outputPath: '/out/stale.mp4' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Three fresh jobs must still exhaust the queue exactly.
    const fresh = [0, 1, 2].map(() => createJob({ sessionToken: 'b', tempDir: trackedTempDir() }));
    const runners = fresh.map(() => makeGatedRunner());
    fresh.forEach((created, index) => enqueue(created.id, runners[index].runner));

    expect(hasCapacity()).toBe(false);
    const fourth = createJob({ sessionToken: 'b', tempDir: trackedTempDir() });
    expect(() => enqueue(fourth.id, makeGatedRunner().runner)).toThrow(TooBusyError);

    runners.forEach((runner) => runner.resolve({ outputPath: '/out/x.mp4' }));
    await waitUntil(() => getJob(fresh[2].id, 'b')?.phase === 'done');
    await awaitQuiescence();
  });
});

describe('jobs registry — ownership', () => {
  it('only returns a job to the session that created it', () => {
    const job = createJob({ sessionToken: 'owner', tempDir: trackedTempDir() });

    expect(getJob(job.id, 'owner')?.id).toBe(job.id);
    expect(getJob(job.id, 'someone-else')).toBeUndefined();
  });

  it('treats a null session token as its own identity, for the gate-disabled case', () => {
    const job = createJob({ sessionToken: null, tempDir: trackedTempDir() });

    expect(getJob(job.id, null)?.id).toBe(job.id);
    expect(getJob(job.id, 'anything')).toBeUndefined();
  });

  it('skips the ownership check when no token is passed at all', () => {
    const job = createJob({ sessionToken: 'owner', tempDir: trackedTempDir() });

    expect(getJob(job.id)?.id).toBe(job.id);
  });
});

describe('jobs registry — phase transitions', () => {
  it('moves queued -> preparing -> (runner-reported phases) -> done', async () => {
    const tempDir = trackedTempDir();
    const job = createJob({ sessionToken: 'a', tempDir });
    expect(getJob(job.id, 'a')?.phase).toBe('queued');

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);

    await waitUntil(() => r.calls.length === 1);
    // The runner already reported 'encoding' with 0.5 by the time it parked on the gate.
    await waitUntil(() => getJob(job.id, 'a')?.phase === 'encoding');
    expect(getJob(job.id, 'a')?.progress).toBe(0.5);

    r.resolve({ outputPath: '/out/x.mp4' });
    await waitUntil(() => getJob(job.id, 'a')?.phase === 'done');
    expect(getJob(job.id, 'a')?.outputPath).toBe('/out/x.mp4');
    expect(getJob(job.id, 'a')?.error).toBeNull();
  });

  it('records a runner rejection as an error, not a crash', async () => {
    const job = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);

    await waitUntil(() => r.calls.length === 1);
    r.reject(new Error('ffmpeg exited 1'));

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'error');
    expect(getJob(job.id, 'a')?.error).toBe('ffmpeg exited 1');
  });
});

describe('jobs registry — the tempDir/outputPath contract is enforced, not just documented', () => {
  it('fails loudly, rather than silently deleting the artifact, when a runner writes its output inside tempDir', async () => {
    const tempDir = trackedTempDir();
    const job = createJob({ sessionToken: 'a', tempDir });
    const insideOutputPath = join(tempDir, 'out.mp4');
    writeFileSync(insideOutputPath, 'finished video');

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);
    r.resolve({ outputPath: insideOutputPath });

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'error');
    const finished = getJob(job.id, 'a');
    // The job must never claim 'done' for a file it's about to delete — that
    // combination (success + gone) is exactly the silent-data-loss failure
    // mode this check exists to prevent.
    expect(finished?.phase).not.toBe('done');
    expect(finished?.outputPath).toBeNull();
    expect(finished?.error).toMatch(/temp directory/i);

    // The file is still gone in the end (it physically lived inside the
    // staging dir every terminal path removes) — but that's now honest,
    // since the job's own status says 'error', not 'done'.
    await waitUntil(() => !existsSync(insideOutputPath));
  });

  it('does not flag a sibling directory that merely shares a string prefix with tempDir', async () => {
    const tempDir = trackedTempDir();
    const job = createJob({ sessionToken: 'a', tempDir });
    // e.g. ".../jobs-test-abc1230/out.mp4" vs. tempDir ".../jobs-test-abc123"
    // — a naive `outputPath.startsWith(tempDir)` would wrongly treat this as
    // contained. It is a genuine sibling, not a child.
    const siblingOutputPath = join(`${tempDir}0`, 'out.mp4');

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);
    r.resolve({ outputPath: siblingOutputPath });

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'done');
    expect(getJob(job.id, 'a')?.outputPath).toBe(siblingOutputPath);
    expect(getJob(job.id, 'a')?.error).toBeNull();
  });
});

describe('jobs registry — cleanup on every terminal path', () => {
  it('removes the temp dir when the runner succeeds', async () => {
    const tempDir = trackedTempDir();
    writeFileSync(join(tempDir, 'input.mp4'), 'stub');
    const job = createJob({ sessionToken: 'a', tempDir });

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);
    r.resolve({ outputPath: '/out/x.mp4' });

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'done');
    // Cleanup runs after the phase flips to 'done', not synchronously with it
    // (the client shouldn't wait on temp-dir housekeeping to hear "finished"),
    // so wait on the thing actually under test rather than racing the phase flag.
    await waitUntil(() => !existsSync(tempDir));
  });

  it('removes the temp dir when the runner fails', async () => {
    const tempDir = trackedTempDir();
    writeFileSync(join(tempDir, 'input.mp4'), 'stub');
    const job = createJob({ sessionToken: 'a', tempDir });

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);
    r.reject(new Error('boom'));

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'error');
    await waitUntil(() => !existsSync(tempDir));
  });

  it('removes the temp dir when a queued job is cancelled before it starts', async () => {
    const tempDir = trackedTempDir();
    writeFileSync(join(tempDir, 'input.mp4'), 'stub');

    // Occupy the one running slot so the next job stays queued.
    const running = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const runningRunner = makeGatedRunner();
    enqueue(running.id, runningRunner.runner);

    const job = createJob({ sessionToken: 'a', tempDir });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);

    expect(cancelJob(job.id, 'a')).toBe(true);
    expect(getJob(job.id, 'a')?.phase).toBe('cancelled');
    await waitUntil(() => !existsSync(tempDir));
    expect(r.calls).toHaveLength(0);
  });

  it('removes the temp dir once a running job is cancelled', async () => {
    const tempDir = trackedTempDir();
    writeFileSync(join(tempDir, 'input.mp4'), 'stub');
    const job = createJob({ sessionToken: 'a', tempDir });

    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);

    expect(cancelJob(job.id, 'a')).toBe(true);

    await waitUntil(() => getJob(job.id, 'a')?.phase === 'cancelled');
    await waitUntil(() => !existsSync(tempDir));
  });

  it('rejects cancelling a job that already reached a terminal phase', async () => {
    const job = createJob({ sessionToken: 'a', tempDir: trackedTempDir() });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);
    r.resolve({ outputPath: '/out/x.mp4' });
    await waitUntil(() => getJob(job.id, 'a')?.phase === 'done');

    expect(cancelJob(job.id, 'a')).toBe(false);
  });
});

describe('jobs registry — sweeping abandoned jobs', () => {
  it('removes a terminal job (and its output file) once its result has aged out', async () => {
    const tempDir = trackedTempDir();
    const job = createJob({ sessionToken: 'a', tempDir });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);

    const outputPath = join(trackedTempDir(), 'out.mp4');
    writeFileSync(outputPath, 'finished video');
    r.resolve({ outputPath });
    await waitUntil(() => getJob(job.id, 'a')?.phase === 'done');
    expect(existsSync(outputPath)).toBe(true);

    // A dropped connection must not cost the render: nothing is removed early.
    const tooSoon = await sweepAbandoned(Date.now() + 10 * 60 * 1000);
    expect(tooSoon).not.toContain(job.id);
    expect(existsSync(outputPath)).toBe(true);

    const swept = await sweepAbandoned(Date.now() + 31 * 60 * 1000);
    expect(swept).toContain(job.id);
    expect(existsSync(outputPath)).toBe(false);
    expect(getJob(job.id, 'a')).toBeUndefined();
  });

  it('aborts a running job abandoned for 30 minutes instead of yanking its temp dir out from under it', async () => {
    const tempDir = trackedTempDir();
    const job = createJob({ sessionToken: 'a', tempDir });
    const r = makeGatedRunner();
    enqueue(job.id, r.runner);
    await waitUntil(() => r.calls.length === 1);

    await sweepAbandoned(Date.now() + 31 * 60 * 1000);
    // The sweep aborts the signal; the fake runner's promise rejects in
    // response, and the registry's own cleanup path takes it from there.
    await waitUntil(() => getJob(job.id, 'a')?.phase === 'cancelled');
    await waitUntil(() => !existsSync(tempDir));
  });
});
