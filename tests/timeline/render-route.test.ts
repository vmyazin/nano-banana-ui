// @vitest-environment node

import { EventEmitter } from 'node:events';
import { rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { createAccount, createSession, setAccountStatus, SESSION_COOKIE } from '../../lib/auth/accounts';
import { useAuthDatabase } from '../../lib/auth/db';
import { __resetJobsForTests, createJob, enqueue, getJob, hasCapacity, type JobRunner } from '../../lib/timeline/jobs';
import { DELETE, GET, MAX_UPLOAD_BYTES, POST } from '../../app/api/timeline/render/route';

const PASSWORD = 'correct horse battery staple';
const RENDER_URL = 'http://localhost/api/timeline/render';

const DEFAULT_OUTPUT = { width: 1920, height: 1080, fps: 30, auto: true };

function clipBlob(bytes = 'fake video bytes'): Blob {
  return new Blob([bytes], { type: 'video/mp4' });
}

function multipartBody(overrides: {
  output?: unknown;
  clipsMeta?: unknown;
  clips?: Blob[];
} = {}): FormData {
  const form = new FormData();
  form.append('output', JSON.stringify(overrides.output ?? DEFAULT_OUTPUT));
  const clips = overrides.clips ?? [clipBlob()];
  form.append('clips', JSON.stringify(overrides.clipsMeta ?? clips.map(() => ({ fit: 'contain' }))));
  clips.forEach((blob, index) => form.append(`clip-${index}`, blob, `clip-${index}.mp4`));
  return form;
}

function postRequest(body: FormData, cookie?: string): NextRequest {
  return new Request(RENDER_URL, {
    method: 'POST',
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : undefined,
    body,
  }) as NextRequest;
}

function getRequest(query: string, cookie?: string): NextRequest {
  return new Request(`${RENDER_URL}${query}`, {
    method: 'GET',
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : undefined,
  }) as NextRequest;
}

function deleteRequest(query: string, cookie?: string): NextRequest {
  return new Request(`${RENDER_URL}${query}`, {
    method: 'DELETE',
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : undefined,
  }) as NextRequest;
}

/** A fake ffmpeg that runs until killed, then closes non-zero the way a real
 *  one does on SIGTERM. Without the kill→close edge a cancelled job's runner
 *  promise would never settle, so the registry would never release its slot
 *  and the "cancelling frees the slot" assertion would test nothing. */
function fakeSpawnHangsUntilKilled() {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      kill: (signal?: string) => boolean;
    };
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => {
      setImmediate(() => child.emit('close', 255));
      return true;
    });
    return child;
  });
}

/** A fake ffmpeg that "succeeds" on the next tick, writing a stub file to
 *  whatever outputPath buildFfmpegArgs put last in the argv it was spawned
 *  with — so the job registry's real cleanup/ownership logic runs against a
 *  real (if fake) finished file, without ever spawning an actual process. */
function fakeSpawnSuccess() {
  spawnMock.mockImplementation((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      kill: (signal?: string) => boolean;
    };
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => true);
    const outputPath = args[args.length - 1];
    setImmediate(() => {
      writeFileSync(outputPath, 'finished video bytes');
      child.emit('close', 0);
    });
    return child;
  });
}

const JOBS_ROOT = join(tmpdir(), 'scene-assembly-timeline-jobs');
const OUTPUT_ROOT = join(tmpdir(), 'scene-assembly-timeline-output');

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

let database: DatabaseSync;

async function approvedSession(email: string): Promise<string> {
  const created = await createAccount(email, PASSWORD);
  if (!('account' in created)) throw new Error('account creation failed in test setup');
  // Only the configured admin address is auto-approved; force approval for
  // every other test account too, so "second session" tests are actually
  // exercising ownership isolation rather than incidentally hitting the
  // pending-approval 403 first.
  setAccountStatus(created.account.id, 'approved');
  const { token } = createSession(created.account.id);
  return token;
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  useAuthDatabase(database);
  __resetJobsForTests();
  spawnMock.mockReset();
  fakeSpawnSuccess();
});

afterEach(() => {
  useAuthDatabase(null);
  database.close();
  __resetJobsForTests();
  delete process.env.TIMELINE_FFMPEG_PATH;
  delete process.env.AUTH_ADMIN_EMAIL;
  vi.clearAllMocks();
});

afterAll(() => {
  rmSync(JOBS_ROOT, { recursive: true, force: true });
  rmSync(OUTPUT_ROOT, { recursive: true, force: true });
});

describe('POST/GET /api/timeline/render — gate order', () => {
  it('404s when TIMELINE_FFMPEG_PATH is unset, even with a valid session', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';
    delete process.env.TIMELINE_FFMPEG_PATH;
    const token = await approvedSession('owner@example.com');

    const response = await POST(postRequest(multipartBody(), token));

    expect(response.status).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('401s when the account gate is enabled and no session cookie is present', async () => {
    process.env.TIMELINE_FFMPEG_PATH = '/usr/bin/ffmpeg';
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';

    const response = await POST(postRequest(multipartBody()));

    expect(response.status).toBe(401);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('never spawns ffmpeg when either gate fails', async () => {
    // ffmpeg gate closed, auth gate would pass — confirms gate 1 short-circuits.
    delete process.env.TIMELINE_FFMPEG_PATH;
    delete process.env.AUTH_ADMIN_EMAIL;

    await POST(postRequest(multipartBody()));

    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/timeline/render — upload ceiling', () => {
  beforeEach(() => {
    process.env.TIMELINE_FFMPEG_PATH = '/usr/bin/ffmpeg';
    delete process.env.AUTH_ADMIN_EMAIL;
  });

  it('413s when the declared body size exceeds the ceiling', async () => {
    // A hand-crafted Content-Length lets the pre-check reject the request
    // without this test actually transferring a gigabyte of bytes.
    const request = new Request(RENDER_URL, {
      method: 'POST',
      headers: { 'content-length': String(MAX_UPLOAD_BYTES + 1), 'content-type': 'multipart/form-data; boundary=x' },
      body: 'irrelevant, never read',
    }) as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toMatch(/too large/i);
    // The ceiling is reported as a field, not only inside the prose: the
    // client cannot know MAX_UPLOAD_BYTES and the spec asks its message to
    // carry the byte count *and* the limit.
    expect(body.limit).toBe(MAX_UPLOAD_BYTES);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('accepts a fractional framerate, which is what a real all-Veo timeline derives', async () => {
    // deriveOutputFormat snaps probed rates onto the common list, which
    // includes 23.976 — an integer-only check here would 400 the single most
    // common timeline this feature exists to render.
    const response = await POST(
      postRequest(multipartBody({ output: { width: 1920, height: 1080, fps: 23.976, auto: true } }))
    );

    expect(response.status).toBe(202);
  });

  it('still rejects a framerate outside the usable range', async () => {
    const response = await POST(
      postRequest(multipartBody({ output: { width: 1920, height: 1080, fps: 1000, auto: true } }))
    );

    expect(response.status).toBe(400);
  });

  it('still requires whole-pixel dimensions', async () => {
    const response = await POST(
      postRequest(multipartBody({ output: { width: 1920.5, height: 1080, fps: 30, auto: true } }))
    );

    expect(response.status).toBe(400);
  });
});

describe('POST /api/timeline/render — capacity checked before the body is read', () => {
  beforeEach(() => {
    process.env.TIMELINE_FFMPEG_PATH = '/usr/bin/ffmpeg';
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';
  });

  it('rejects with 503 before doing any of the expensive work a real upload triggers, once the queue is full', async () => {
    const token = await approvedSession('owner@example.com');

    // Fill every running + queued slot (1 + 2) directly through the registry
    // — a runner that never resolves, so capacity stays "full" for the
    // duration of the assertion below regardless of timing.
    const hangingRunner: JobRunner = () => new Promise(() => {});
    await mkdir(JOBS_ROOT, { recursive: true });
    for (let i = 0; i < 3; i += 1) {
      const tempDir = await mkdtemp(join(JOBS_ROOT, 'capacity-test-'));
      const job = createJob({ sessionToken: null, tempDir });
      enqueue(job.id, hangingRunner);
    }
    expect(hasCapacity()).toBe(false);

    // A real multipart body (same shape a genuine upload would send) so this
    // proves the *route* short-circuits before doing anything with it —
    // parsing it, or writing a clip to a new temp dir — rather than merely
    // asserting on low-level stream-read timing, which Node's own Request
    // implementation can begin eagerly regardless of what route code does.
    const dirsBefore = await readdir(JOBS_ROOT);

    const response = await POST(postRequest(multipartBody(), token));

    expect(response.status).toBe(503);
    expect(spawnMock).not.toHaveBeenCalled();
    // No new job directory was created — the expensive part (buffering the
    // upload, writing clip files to disk) never ran.
    const dirsAfter = await readdir(JOBS_ROOT);
    expect(dirsAfter.sort()).toEqual(dirsBefore.sort());
  });
});

describe('POST/GET /api/timeline/render — success path and ownership', () => {
  beforeEach(() => {
    process.env.TIMELINE_FFMPEG_PATH = '/usr/bin/ffmpeg';
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';
  });

  it('returns a job id on success, and GET status reports that job reaching done', async () => {
    const token = await approvedSession('owner@example.com');

    const postResponse = await POST(postRequest(multipartBody(), token));
    expect(postResponse.status).toBe(202);
    const { jobId } = await postResponse.json();
    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);

    let phase = '';
    await waitUntil(async () => {
      const statusResponse = await GET(getRequest(`?id=${jobId}`, token));
      const status = await statusResponse.json();
      phase = status.phase;
      return phase === 'done';
    });
    expect(phase).toBe('done');

    const resultResponse = await GET(getRequest(`?id=${jobId}&result=1`, token));
    expect(resultResponse.status).toBe(200);
    expect(resultResponse.headers.get('content-type')).toBe('video/mp4');
  });

  it('does not let a second session read the first session job status', async () => {
    const ownerToken = await approvedSession('owner@example.com');
    const otherToken = await approvedSession('friend@example.com');

    const postResponse = await POST(postRequest(multipartBody(), ownerToken));
    const { jobId } = await postResponse.json();

    const otherStatus = await GET(getRequest(`?id=${jobId}`, otherToken));
    expect(otherStatus.status).toBe(404);

    const otherResult = await GET(getRequest(`?id=${jobId}&result=1`, otherToken));
    expect(otherResult.status).toBe(404);

    // Sanity: the owner really can.
    const ownerStatus = await GET(getRequest(`?id=${jobId}`, ownerToken));
    expect(ownerStatus.status).toBe(200);
  });

  it('rejects a request missing a clip file for a declared clip', async () => {
    const token = await approvedSession('owner@example.com');
    const form = new FormData();
    form.append('output', JSON.stringify(DEFAULT_OUTPUT));
    form.append('clips', JSON.stringify([{ fit: 'contain' }]));
    // no 'clip-0' field appended

    const response = await POST(postRequest(form, token));

    expect(response.status).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects malformed output JSON', async () => {
    const token = await approvedSession('owner@example.com');

    const response = await POST(postRequest(multipartBody({ output: { width: -1, height: 0, fps: 0 } }), token));

    expect(response.status).toBe(400);
  });
});

/**
 * Without DELETE, the browser's Cancel button ends only the client's interest:
 * the fetch aborts, the UI returns instantly, and ffmpeg keeps running to
 * completion holding the one concurrency slot. These cover the two things that
 * actually matter — the slot really comes back, and a cancel is scoped to the
 * session that owns the job.
 */
describe('DELETE /api/timeline/render — cancellation', () => {
  beforeEach(() => {
    process.env.TIMELINE_FFMPEG_PATH = '/usr/bin/ffmpeg';
    process.env.AUTH_ADMIN_EMAIL = 'owner@example.com';
    fakeSpawnHangsUntilKilled();
  });

  it('404s when TIMELINE_FFMPEG_PATH is unset, before the account gate runs', async () => {
    delete process.env.TIMELINE_FFMPEG_PATH;

    const response = await DELETE(deleteRequest('?id=anything'));

    expect(response.status).toBe(404);
  });

  it('401s when the account gate is enabled and no session cookie is present', async () => {
    const response = await DELETE(deleteRequest('?id=anything'));

    expect(response.status).toBe(401);
  });

  it('frees the concurrency slot, so an enqueue that was at capacity now succeeds', async () => {
    const token = await approvedSession('owner@example.com');

    // Fill running + queued (1 + 2). Each ffmpeg hangs until killed.
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await POST(postRequest(multipartBody(), token));
      expect(response.status).toBe(202);
      ids.push((await response.json()).jobId);
    }
    expect(hasCapacity()).toBe(false);

    // At capacity, a fourth upload is refused outright.
    expect((await POST(postRequest(multipartBody(), token))).status).toBe(503);

    // Cancel the one that is actually running. The registry aborts its
    // runner, the runner SIGTERMs ffmpeg, and the slot is released once the
    // child closes — none of which happens without this verb.
    const cancel = await DELETE(deleteRequest(`?id=${ids[0]}`, token));
    expect(cancel.status).toBe(200);
    expect(await cancel.json()).toEqual({ cancelled: true });

    await waitUntil(() => getJob(ids[0])?.phase === 'cancelled');
    await waitUntil(() => hasCapacity());

    // The same request that was refused a moment ago is now accepted.
    const retry = await POST(postRequest(multipartBody(), token));
    expect(retry.status).toBe(202);
  });

  it('does not let a second session cancel the first session job, and reads as 404 rather than 403', async () => {
    const ownerToken = await approvedSession('owner@example.com');
    const otherToken = await approvedSession('friend@example.com');

    const postResponse = await POST(postRequest(multipartBody(), ownerToken));
    const { jobId } = await postResponse.json();
    await waitUntil(() => getJob(jobId)?.phase === 'encoding' || getJob(jobId)?.phase === 'preparing');

    const foreign = await DELETE(deleteRequest(`?id=${jobId}`, otherToken));

    expect(foreign.status).toBe(404);
    // Still running: the foreign cancel was refused, not merely unreported.
    expect(getJob(jobId)?.phase).not.toBe('cancelled');

    // Sanity: the owner really can.
    const owned = await DELETE(deleteRequest(`?id=${jobId}`, ownerToken));
    expect(owned.status).toBe(200);
    await waitUntil(() => getJob(jobId)?.phase === 'cancelled');
  });

  it('404s an unknown job id', async () => {
    const token = await approvedSession('owner@example.com');

    const response = await DELETE(deleteRequest('?id=not-a-real-job', token));

    expect(response.status).toBe(404);
  });

  it('answers 200 with cancelled:false for a job that already finished', async () => {
    fakeSpawnSuccess();
    const token = await approvedSession('owner@example.com');

    const { jobId } = await (await POST(postRequest(multipartBody(), token))).json();
    await waitUntil(() => getJob(jobId)?.phase === 'done');

    const response = await DELETE(deleteRequest(`?id=${jobId}`, token));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelled: false });
  });
});
