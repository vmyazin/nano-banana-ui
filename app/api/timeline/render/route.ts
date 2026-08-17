import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { NextRequest, NextResponse } from 'next/server';

import { isGateFailure, readSessionCookie, requireApprovedAccount } from '@/lib/auth/guard';
import {
  cancelJob,
  createJob,
  enqueue,
  getJob,
  hasCapacity,
  sweepAbandoned,
  TooBusyError,
  type JobRunner,
} from '@/lib/timeline/jobs';
import { buildFfmpegArgs, type FfmpegInput } from '@/lib/timeline/render/ffmpeg-args';
import type { TimelineOutput } from '@/store/useTimelineStore';

// Spawns a real OS process and touches the filesystem for temp/output files —
// the edge runtime offers neither.
export const runtime = 'nodejs';

/**
 * Total bytes accepted per upload, enforced by this route rather than left to
 * whatever the reverse proxy in front of it happens to allow. nginx's
 * `client_max_body_size` defaults to 1 MB (see .env.example) — this is the
 * app's own, much larger, ceiling.
 *
 * Set to the same order of magnitude as `MAX_REMOTE_VIDEO_BYTES` in
 * lib/media-download.ts (512 MiB) — this app's existing precedent for "how
 * big a video is allowed to be" — even though this is a *total* across every
 * clip in one timeline, not a per-clip bound: fal/kie clips run a few
 * seconds each, commonly tens of MB at 1080p, so 512 MiB is still generous
 * headroom for a real multi-clip render. (An earlier version of this route
 * used 1 GiB, chosen without that comparison; there is nothing this feature
 * produces that needs it.) Every uploaded byte is still buffered by the
 * platform's FormData parser before this route ever inspects it, so this
 * number is a memory ceiling per upload as much as a network one — bounding
 * how many uploads can be *in flight* at once (see `hasCapacity()` below,
 * checked before any of that buffering happens) matters just as much as
 * bounding the size of any one of them. A true streaming-to-disk multipart
 * parser would remove the memory concern entirely but needs a dependency
 * this app doesn't have.
 */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

/**
 * At most this many clips per render, so a client-supplied array length is
 * never trusted unbounded. This is the route's own bound and nothing else's:
 * `lib/timeline/jobs.ts` bounds *concurrency* (one running job, two queued),
 * not the length of any one timeline, so there is no registry limit for this
 * to agree with. 64 clips at the few seconds each fal/Kie produce is already
 * several minutes of output — far past anything this slice is for.
 */
const MAX_CLIPS = 64;

const JOBS_ROOT = join(tmpdir(), 'scene-assembly-timeline-jobs');
/** Deliberately a sibling of JOBS_ROOT, never inside it — outputPath must
 *  live outside a job's tempDir or the registry refuses to report success
 *  (see lib/timeline/jobs.ts). */
const OUTPUT_ROOT = join(tmpdir(), 'scene-assembly-timeline-output');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function ffmpegPath(): string {
  return (process.env.TIMELINE_FFMPEG_PATH ?? '').trim();
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * 413 carries the ceiling as a machine-readable field, not only inside the
 * prose. The client has no other way to know it — `MAX_UPLOAD_BYTES` lives on
 * the server — and the design spec asks that message to name the byte count
 * *and* the limit, since a 413 is the likely first symptom of a proxy whose
 * `client_max_body_size` was never raised and the two numbers are what tell
 * those cases apart.
 */
function failTooLarge(error: string) {
  return NextResponse.json({ error, limit: MAX_UPLOAD_BYTES }, { status: 413 });
}

class UploadTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super('Upload exceeded the configured ceiling.');
    this.name = 'UploadTooLargeError';
  }
}

/**
 * `JOBS_ROOT` entries are named by `mkdtemp`'s random suffix (`job-XXXXXX`),
 * not by job id, so they can never be matched back to a live job by name —
 * safe only as a one-time *startup* wipe (see `ensureSweepLoopStarted`),
 * never on a recurring timer: a periodic version of this would delete an
 * actively-running job's own input directory, since its on-disk name is
 * never going to equal any job id. Startup is different: the in-memory job
 * registry is empty the instant this process starts, so nothing under
 * `JOBS_ROOT` can belong to a job this process actually knows about yet —
 * anything present is left over from a previous process, most often a crash
 * mid-render, which otherwise orphans that directory forever (the registry
 * that would normally reclaim it lived only in the crashed process's memory).
 */
async function wipeStaleJobsRootOnStartup(): Promise<void> {
  const entries = await readdir(JOBS_ROOT).catch(() => [] as string[]);
  await Promise.all(
    entries.map((name) => rm(join(JOBS_ROOT, name), { recursive: true, force: true }).catch(() => {}))
  );
}

/**
 * Unlike `JOBS_ROOT`, `OUTPUT_ROOT` subdirectories *are* named by job id
 * (`OUTPUT_ROOT/<job.id>`), so they can be matched against the live registry
 * — safe to run repeatedly, not just at startup. Removes a directory
 * whenever its job id is not (or no longer) tracked: either `sweepAbandoned`
 * just reaped that job — which deletes `job.outputPath`, the file, but has
 * no reason to know about this route's own directory-per-job convention, so
 * it leaves an empty directory behind — or the directory predates this
 * process entirely (the startup case, same reasoning as the jobs-root wipe
 * above).
 */
async function reconcileOutputRoot(): Promise<void> {
  const entries = await readdir(OUTPUT_ROOT).catch(() => [] as string[]);
  await Promise.all(
    entries.map(async (name) => {
      if (getJob(name)) return; // still a live/known job — leave its directory alone
      await rm(join(OUTPUT_ROOT, name), { recursive: true, force: true }).catch(() => {});
    })
  );
}

/**
 * Starts this process's one render-maintenance loop, and returns a promise
 * that resolves once the *startup* reconciliation (above) has actually run.
 * Callers `await` it before creating any directory of their own, so a
 * request racing the very first call can't have its brand-new tempDir wiped
 * out from under it by the startup sweep — the two are serialized through
 * this one cached promise rather than a boolean flag.
 *
 * Once started, `sweepAbandoned` (otherwise only ever called from tests) and
 * `reconcileOutputRoot` both run on a 5-minute timer so abandoned temp dirs
 * and orphaned output directories are actually reclaimed instead of
 * accumulating on the host forever. The process this runs in is the
 * long-lived `next start` behind pm2 (see scripts/deploy-production.sh), so
 * one `setInterval` per process lifetime is correct; `unref()` so it never
 * itself keeps the process — or a test run — alive.
 */
let sweepLoopStarted: Promise<void> | null = null;
function ensureSweepLoopStarted(): Promise<void> {
  if (!sweepLoopStarted) {
    sweepLoopStarted = (async () => {
      await wipeStaleJobsRootOnStartup();
      await reconcileOutputRoot();

      const timer = setInterval(() => {
        void sweepAbandoned().catch(() => {});
        void reconcileOutputRoot().catch(() => {});
      }, SWEEP_INTERVAL_MS);
      timer.unref?.();
    })();
  }
  return sweepLoopStarted;
}

/**
 * Wraps the request body in a byte-counting stream so the upload ceiling is
 * enforced against what is actually read, not just the declared
 * `Content-Length` — which can be absent (chunked transfer) or, for a
 * hand-crafted request bypassing the browser, simply wrong.
 */
function capRequestBody(request: Request, maxBytes: number): Request {
  const body = request.body;
  if (!body) return request;

  let total = 0;
  const capped = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            controller.error(new UploadTooLargeError(total));
            await reader.cancel().catch(() => {});
            return;
          }
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      void body.cancel(reason).catch(() => {});
    },
  });

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: capped,
    // Required by the Fetch spec whenever a Request is constructed with a
    // streaming body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function isPositiveFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/**
 * Framerate, unlike width and height, must NOT be required to be an integer.
 * `deriveOutputFormat` snaps probed rates onto the common list, which includes
 * the NTSC rates — 23.976 is exactly what the framerate probe reads off real
 * Veo output, and an integer-only check here would 400 the single most common
 * timeline this feature exists to render. ffmpeg's `fps=` filter and `-r` both
 * take fractional rates, so the value is safe; it is only bounded.
 */
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseOutput(raw: FormDataEntryValue | null): TimelineOutput | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { width, height, fps } = parsed as Record<string, unknown>;
  if (
    isPositiveFiniteInt(width) &&
    isPositiveFiniteInt(height) &&
    isPositiveFiniteNumber(fps) &&
    width <= 7680 &&
    height <= 7680 &&
    fps <= 240
  ) {
    // `auto` is a client-only concept (whether the format still tracks the
    // clips); the render itself only ever reads width/height/fps.
    return { width, height, fps, auto: false };
  }
  return null;
}

interface ClipMeta {
  fit: 'contain' | 'cover';
}

function parseClipsMeta(raw: FormDataEntryValue | null): ClipMeta[] | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_CLIPS) return null;

  const result: ClipMeta[] = [];
  for (const entry of parsed) {
    const fit = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).fit : null;
    if (fit !== 'contain' && fit !== 'cover') return null;
    result.push({ fit });
  }
  return result;
}

/**
 * Builds the `JobRunner` that actually spawns ffmpeg for one render. The
 * binary is spawned directly with an argv array (`buildFfmpegArgs`'s output)
 * — never a shell, so nothing derived from an uploaded filename or the
 * output format ever reaches shell interpretation.
 */
function createFfmpegRunner(inputs: FfmpegInput[], output: TimelineOutput, outputPath: string): JobRunner {
  const args = buildFfmpegArgs({ inputs, output, outputPath });

  return async (_job, ctx) => {
    if (ctx.signal.aborted) throw new Error('Render was cancelled before it started.');

    ctx.onProgress({ phase: 'encoding', completed: null });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });

      let stderrTail = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      });

      const onAbort = () => {
        child.kill('SIGTERM');
      };
      ctx.signal.addEventListener('abort', onAbort);

      child.on('error', (err) => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', (code) => {
        ctx.signal.removeEventListener('abort', onAbort);
        if (ctx.signal.aborted) {
          reject(new Error('Render was cancelled.'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail}`));
        }
      });
    });

    ctx.onProgress({ phase: 'muxing', completed: 1 });
    return { outputPath };
  };
}

/**
 * Resolves the session identity used to scope job ownership. `null` (not
 * `undefined`) whenever the gate is disabled, matching `lib/timeline/jobs.ts`'s
 * contract: a job's `sessionToken` is `null` in that case, and passing `null`
 * back into `getJob` (rather than omitting it) is what keeps the ownership
 * check active — everyone shares the same "no gate" identity, which is
 * correct since there is no account concept to isolate between.
 */
function sessionIdentity(request: Request, gate: { account: unknown }): string | null {
  return gate.account ? (readSessionCookie(request) ?? null) : null;
}

export async function POST(request: NextRequest) {
  // Gate 1: the binary must be configured. Checked FIRST and answered with a
  // bare 404, because isGateEnabled() is false whenever AUTH_ADMIN_EMAIL is
  // unset — checking auth first would mean every public checkout of this
  // repo, where nobody sets that variable, exposes an unauthenticated
  // endpoint that spawns ffmpeg on the host.
  if (!ffmpegPath()) return new NextResponse(null, { status: 404 });

  // Gate 2: the routes that spend the app owner's money or bandwidth.
  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

  // Checked before any body parsing, deliberately: `enqueue`'s own capacity
  // check runs far too late to bound anything, since by the time a caller
  // reaches it the expensive part — buffering the whole multipart body into
  // memory and writing every clip to disk — has already happened. A fourth
  // concurrent upload rejected only at `enqueue` has already cost up to
  // MAX_UPLOAD_BYTES of RSS and disk I/O for nothing. `hasCapacity()` is the
  // same check `enqueue` makes, just moved to where it can actually prevent
  // that cost instead of merely explaining it afterward.
  if (!hasCapacity()) return fail(503, new TooBusyError().message);

  await ensureSweepLoopStarted();

  // Fast pre-check against the declared header — cheap, and rejects an
  // obviously oversized request before touching the body at all. Not trusted
  // alone: `capRequestBody` below enforces the same ceiling against bytes
  // actually read, since Content-Length can be absent or wrong.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return failTooLarge(`Upload too large: ${declaredLength} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
  }

  let formData: FormData;
  try {
    formData = await capRequestBody(request, MAX_UPLOAD_BYTES).formData();
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return failTooLarge(`Upload too large: exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
    }
    return fail(400, 'The upload could not be read as multipart form data.');
  }

  const output = parseOutput(formData.get('output'));
  if (!output) return fail(400, 'A valid output format is required.');

  const clipsMeta = parseClipsMeta(formData.get('clips'));
  if (!clipsMeta) return fail(400, 'At least one clip is required.');

  const files: File[] = [];
  for (let index = 0; index < clipsMeta.length; index += 1) {
    const entry = formData.get(`clip-${index}`);
    if (!(entry instanceof File) || entry.size === 0) {
      return fail(400, `Clip ${index + 1} is missing or empty.`);
    }
    files.push(entry);
  }

  const sessionToken = sessionIdentity(request, gate);

  await mkdir(JOBS_ROOT, { recursive: true });
  const tempDir = await mkdtemp(join(JOBS_ROOT, 'job-'));
  const job = createJob({ sessionToken, tempDir });

  const inputs: FfmpegInput[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const path = join(tempDir, `clip-${index}.input`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(path, bytes);
      inputs.push({ path, fit: clipsMeta[index].fit });
    }
  } catch {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return fail(400, 'The uploaded clips could not be saved.');
  }

  const outputDir = join(OUTPUT_ROOT, job.id);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'output.mp4');

  const runner = createFfmpegRunner(inputs, output, outputPath);

  try {
    enqueue(job.id, runner);
  } catch (err) {
    // The job was registered by createJob but never entered the queue —
    // cancelJob still tears down its tempDir even though it was never
    // actually waiting (see its own doc comment).
    cancelJob(job.id, sessionToken);
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof TooBusyError) return fail(503, err.message);
    throw err;
  }

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

/**
 * Cancels a render the client walked away from. Without this the browser's
 * Cancel button only ever aborted the *client* — the fetch stopped, the UI
 * returned instantly, and ffmpeg kept burning the single concurrency slot to
 * completion, holding its temp directory until the 30-minute sweeper got to
 * it. Design spec's error-handling section requires cancellation to reach the
 * server: `cancelJob` aborts the runner (which SIGTERMs ffmpeg) and the
 * registry's own terminal path removes the temp directory.
 *
 * Gated exactly like POST and GET — ffmpeg path first with a bare 404, then
 * the account gate, then ownership. An unknown *or* foreign job id reads as
 * 404, the same way a status read does: a caller must not be able to probe
 * which job ids exist by watching cancel come back "already finished"
 * instead of "no such job".
 */
export async function DELETE(request: NextRequest) {
  if (!ffmpegPath()) return new NextResponse(null, { status: 404 });

  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

  const sessionToken = sessionIdentity(request, gate);
  const id = new URL(request.url).searchParams.get('id');
  // No id at all is not a capability probe here the way it is on GET — there
  // is nothing to cancel, and answering 404 keeps every "this job is not
  // yours to cancel" response identical.
  if (!id || !getJob(id, sessionToken)) return fail(404, 'No such render job.');

  // False here means the job existed and was owned but had already reached a
  // terminal phase — cancelling something already finished is not an error,
  // so it answers 200 with `cancelled: false` rather than a failure status.
  const cancelled = cancelJob(id, sessionToken);

  // The registry removes `tempDir` (the uploaded inputs) on its own terminal
  // path but knows nothing about this route's OUTPUT_ROOT/<id> convention.
  // Safe to remove even while a just-SIGTERMed ffmpeg still holds the file
  // open: the unlink drops the directory entry, and the process's remaining
  // writes go to an inode that is freed the moment it exits.
  await rm(join(OUTPUT_ROOT, id), { recursive: true, force: true }).catch(() => {});

  return NextResponse.json({ cancelled });
}

export async function GET(request: NextRequest) {
  if (!ffmpegPath()) return new NextResponse(null, { status: 404 });

  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

  // So the startup reconciliation above still runs even if the very first
  // request this process handles is a status poll rather than a POST.
  await ensureSweepLoopStarted();

  const sessionToken = sessionIdentity(request, gate);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  // No id: a capability probe. Reaching here means both gates already
  // passed, which is exactly what the client engine's `unavailableReason`
  // needs to know.
  if (!id) return NextResponse.json({ ok: true });

  // A mismatched session reads as "not found," not "forbidden" — the
  // registry's own ownership rule (lib/timeline/jobs.ts#getJob), which keeps
  // a job's status and result readable only by the session that created it.
  const job = getJob(id, sessionToken);
  if (!job) return fail(404, 'No such render job.');

  if (searchParams.get('result')) {
    if (job.phase !== 'done' || !job.outputPath) {
      return fail(409, 'This render has not finished yet.');
    }
    const stats = await stat(job.outputPath).catch(() => null);
    if (!stats) return fail(404, 'The finished file is no longer available.');

    // Not deleted here: a dropped connection must not cost a multi-minute
    // render. It is removed only once by the sweeper, once nobody has
    // touched the job for a while.
    const stream = Readable.toWeb(createReadStream(job.outputPath));
    return new NextResponse(stream as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(stats.size),
        'Content-Disposition': 'attachment; filename="timeline-export.mp4"',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    id: job.id,
    phase: job.phase,
    progress: job.progress,
    error: job.error,
  });
}
