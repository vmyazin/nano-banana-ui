import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import type { RenderProgress } from './render/port';

/**
 * In-process render job registry. Server-only: no browser globals, no
 * `child_process`. It does not spawn ffmpeg itself — the caller (the render
 * route, task 11) injects a `JobRunner` into `enqueue`, so this module stays
 * testable with a fake runner and the real spawn logic stays out of it.
 */

export type JobPhase = RenderProgress['phase'] | 'queued' | 'done' | 'error' | 'cancelled';

const TERMINAL_PHASES: ReadonlySet<JobPhase> = new Set(['done', 'error', 'cancelled']);

export interface RenderJob {
  readonly id: string;
  /** Owning session token, or null when the auth gate is disabled. */
  readonly sessionToken: string | null;
  /**
   * Per-job working directory holding the uploaded inputs. Removed on every
   * terminal path (success, failure, cancellation) and by the sweeper.
   *
   * Runners MUST write the final output file somewhere other than this
   * directory (or a subpath this module is not told to remove it separately
   * from) — see `JobRunner`. If the output lived under `tempDir`, it would be
   * deleted the instant the render finished, before `GET /result` ever had a
   * chance to serve it.
   */
  readonly tempDir: string;
  readonly createdAt: number;
  /** Bumped on every phase/progress change; what the abandonment sweep reads. */
  updatedAt: number;
  phase: JobPhase;
  /** 0..1, or null where the phase cannot report a fraction. */
  progress: number | null;
  outputPath: string | null;
  error: string | null;
}

export interface JobRunnerContext {
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
}

/**
 * Actually spawns and drives ffmpeg. Injected by the caller so this module
 * never imports `child_process` and tests never need to mock it.
 *
 * Contract: resolve with the path of the finished file (outside `tempDir`,
 * see `RenderJob.tempDir`), or reject. On abort (`ctx.signal`), reject
 * promptly — the registry records that as a cancellation rather than a
 * failure only when the signal is the thing that fired.
 */
export type JobRunner = (job: RenderJob, ctx: JobRunnerContext) => Promise<{ outputPath: string }>;

export class TooBusyError extends Error {
  constructor(message = 'Render queue is full. Try again shortly.') {
    super(message);
    this.name = 'TooBusyError';
  }
}

/** One ffmpeg process running, at most two more waiting; a fourth is rejected. */
const MAX_RUNNING = 1;
const MAX_QUEUED = 2;

/** Terminal jobs whose result nobody fetched are reclaimed after this long. */
const ABANDONED_MS = 30 * 60 * 1000;

const jobs = new Map<string, RenderJob>();
const controllers = new Map<string, AbortController>();
const waiting: Array<{ id: string; run: JobRunner }> = [];
/** Ids currently inside a runner call — distinguishes "running" from "queued" for cancellation. */
const active = new Set<string>();
let runningCount = 0;

export function createJob(opts: { sessionToken: string | null; tempDir: string }): RenderJob {
  const now = Date.now();
  const job: RenderJob = {
    id: randomUUID(),
    sessionToken: opts.sessionToken,
    tempDir: opts.tempDir,
    createdAt: now,
    updatedAt: now,
    phase: 'queued',
    progress: null,
    outputPath: null,
    error: null,
  };
  jobs.set(job.id, job);
  return job;
}

/**
 * Looks up a job. When `sessionToken` is passed, a mismatch (including a job
 * created under a different token, or `null` vs a real token) reads as "not
 * found" rather than "forbidden" — the render route must always pass its
 * caller's session token so a job's status and result stay readable only by
 * the session that created it. Omitting the second argument skips that check
 * and is only for this module's own internal use (the sweeper).
 */
export function getJob(id: string, sessionToken?: string | null): RenderJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (sessionToken !== undefined && job.sessionToken !== sessionToken) return undefined;
  return job;
}

/**
 * Schedules `run` for a job created by `createJob`. Throws `TooBusyError`
 * synchronously, before touching the filesystem or the job, when one job is
 * already running and two more are already waiting — a fourth is rejected
 * outright rather than queued indefinitely, because this is the same machine
 * serving the app.
 */
export function enqueue(id: string, run: JobRunner): void {
  const job = jobs.get(id);
  if (!job) throw new Error(`enqueue: unknown job ${id}`);
  if (runningCount + waiting.length >= MAX_RUNNING + MAX_QUEUED) {
    throw new TooBusyError();
  }

  controllers.set(id, new AbortController());
  waiting.push({ id, run });
  drain();
}

function drain(): void {
  if (runningCount >= MAX_RUNNING) return;
  const next = waiting.shift();
  if (!next) return;
  void runOne(next);
}

async function runOne(entry: { id: string; run: JobRunner }): Promise<void> {
  const job = jobs.get(entry.id);
  const controller = controllers.get(entry.id);
  if (!job || !controller) {
    drain();
    return;
  }

  runningCount += 1;
  active.add(entry.id);

  try {
    if (controller.signal.aborted) {
      setPhase(job, 'cancelled', job.progress);
      return;
    }

    setPhase(job, 'preparing', null);
    const result = await entry.run(job, {
      signal: controller.signal,
      onProgress: (progress) => setPhase(job, progress.phase, progress.completed),
    });
    job.outputPath = result.outputPath;
    setPhase(job, 'done', 1);
  } catch (err) {
    if (controller.signal.aborted) {
      setPhase(job, 'cancelled', job.progress);
    } else {
      job.error = err instanceof Error ? err.message : String(err);
      setPhase(job, 'error', job.progress);
    }
  } finally {
    active.delete(entry.id);
    controllers.delete(entry.id);
    await cleanupTempDir(job);
    runningCount -= 1;
    drain();
  }
}

/**
 * Cancels a job that has not reached a terminal phase. A job still waiting in
 * the queue is finished here directly; a running job is aborted and `runOne`
 * records the cancellation and cleans up once the injected runner actually
 * stops. Returns false for an unknown, unowned, or already-terminal job.
 */
export function cancelJob(id: string, sessionToken?: string | null): boolean {
  const job = getJob(id, sessionToken);
  if (!job || TERMINAL_PHASES.has(job.phase)) return false;

  if (active.has(id)) {
    controllers.get(id)?.abort();
    return true;
  }

  const waitIndex = waiting.findIndex((w) => w.id === id);
  if (waitIndex >= 0) waiting.splice(waitIndex, 1);
  controllers.delete(id);

  setPhase(job, 'cancelled', job.progress);
  void cleanupTempDir(job);
  return true;
}

/**
 * Reclaims jobs nobody has touched in 30 minutes: a terminal job whose
 * result was never fetched, or (defensively) a running/queued job whose
 * client went away entirely. Running jobs are aborted rather than yanked out
 * from under the runner; `runOne`'s cleanup path takes it from there.
 * Returns the ids actually swept, for logging/tests.
 */
export async function sweepAbandoned(now: number = Date.now()): Promise<string[]> {
  const swept: string[] = [];

  for (const job of jobs.values()) {
    if (now - job.updatedAt < ABANDONED_MS) continue;

    if (active.has(job.id)) {
      controllers.get(job.id)?.abort();
      continue;
    }

    const waitIndex = waiting.findIndex((w) => w.id === job.id);
    if (waitIndex >= 0) waiting.splice(waitIndex, 1);
    controllers.delete(job.id);

    if (!TERMINAL_PHASES.has(job.phase)) {
      setPhase(job, 'cancelled', job.progress);
    }

    await cleanupTempDir(job);
    if (job.outputPath) {
      await rm(job.outputPath, { force: true }).catch(() => {});
    }
    jobs.delete(job.id);
    swept.push(job.id);
  }

  return swept;
}

function setPhase(job: RenderJob, phase: JobPhase, progress: number | null): void {
  job.phase = phase;
  job.progress = progress;
  job.updatedAt = Date.now();
}

async function cleanupTempDir(job: RenderJob): Promise<void> {
  try {
    await rm(job.tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort: an already-removed or never-created directory is not an error.
  }
}

/**
 * Test-only: clears all module state between test cases. This registry is a
 * process-wide singleton by design (it serializes the one real ffmpeg slot
 * across every request), which means tests sharing a module instance must
 * reset it explicitly rather than relying on fresh imports.
 */
export function __resetJobsForTests(): void {
  jobs.clear();
  controllers.clear();
  waiting.length = 0;
  active.clear();
  runningCount = 0;
}
