import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
 * app's own, much larger, ceiling, chosen with headroom for a timeline of
 * several generated clips (fal/kie clips run a few seconds each, commonly
 * tens of MB at 1080p) while still being a concrete number rather than
 * "whatever RAM is free." Every uploaded byte is buffered by the platform's
 * FormData parser before this route ever inspects it, so this is a memory
 * ceiling as much as a network one, not something a streaming-to-disk parser
 * would size — there is no such parser in this app's dependencies today.
 */
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/** At most this many clips per render — matches the registry's own sanity
 *  bound rather than trusting a client-supplied array length unbounded. */
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

class UploadTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super('Upload exceeded the configured ceiling.');
    this.name = 'UploadTooLargeError';
  }
}

/**
 * Runs `sweepAbandoned` on a timer so abandoned temp dirs and output files
 * are actually reclaimed instead of accumulating on the host forever — it is
 * otherwise only ever called from tests. Started lazily, once, the first
 * time this process handles a render request (rather than unconditionally at
 * module scope): the process this runs in is the long-lived `next start`
 * behind pm2 (see scripts/deploy-production.sh), so a single `setInterval`
 * here lives for the whole process lifetime. `unref()` so it never itself
 * keeps the process — or a test run — alive.
 */
let sweepLoopStarted = false;
function ensureSweepLoopStarted(): void {
  if (sweepLoopStarted) return;
  sweepLoopStarted = true;
  const timer = setInterval(() => {
    void sweepAbandoned().catch(() => {});
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
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
    isPositiveFiniteInt(fps) &&
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

  ensureSweepLoopStarted();

  // Fast pre-check against the declared header — cheap, and rejects an
  // obviously oversized request before touching the body at all. Not trusted
  // alone: `capRequestBody` below enforces the same ceiling against bytes
  // actually read, since Content-Length can be absent or wrong.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return fail(413, `Upload too large: ${declaredLength} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
  }

  let formData: FormData;
  try {
    formData = await capRequestBody(request, MAX_UPLOAD_BYTES).formData();
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return fail(413, `Upload too large: exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
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

export async function GET(request: NextRequest) {
  if (!ffmpegPath()) return new NextResponse(null, { status: 404 });

  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

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
