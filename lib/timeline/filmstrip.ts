/**
 * Filmstrips: the row of stills a track block wears instead of one stretched
 * poster.
 *
 * A block's width *is* its trimmed duration, so a single image stretched across
 * it says nothing about what happens inside the clip — and the poster it was
 * stretching is the clip's *last* frame (see `acquireClipMedia`), which is the
 * one still guaranteed to misrepresent the block it sits under. A strip of
 * frames sampled across the source reads the way every editor's track reads:
 * position along the block is position in time.
 *
 * Two halves live here, and the split matters:
 *
 * - The arithmetic (how many frames to sample, where, and which frame each tile
 *   of a given block shows) is pure, like `scale.ts` — the component only draws.
 * - The decode is a session-scoped cache keyed by *record* id, not placement id.
 *   The same clip can sit on the timeline several times and each placement can
 *   be trimmed differently; they all read the same frames. Frames are sampled
 *   across the whole source, never the trimmed range, so trimming and resizing
 *   re-tile an existing strip rather than re-decoding one.
 */

import type { ClipDimensions } from '@/lib/timeline/derive-output';

/** Roughly one still per this many seconds of source, within the bounds below. */
const SECONDS_PER_FRAME = 1.5;
export const MIN_FILMSTRIP_FRAMES = 4;
export const MAX_FILMSTRIP_FRAMES = 12;

/** The strip's height in the track block (`h-16`), in CSS px. */
export const FILMSTRIP_HEIGHT = 64;
/** A tile narrower than this is a stripe, not a picture. */
const MIN_TILE_WIDTH = 20;
/** Nor is one wider than the block usefully a "strip" — cap the aspect we honour. */
const MAX_TILE_WIDTH = 240;
/** Decoded at 2x so the tiles stay crisp on retina without storing full frames. */
const FRAME_HEIGHT = FILMSTRIP_HEIGHT * 2;
const FRAME_QUALITY = 0.6;

/** How many stills to sample across a source of this length. */
export function filmstripFrameCount(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const wanted = Math.round(durationSeconds / SECONDS_PER_FRAME);
  return Math.min(MAX_FILMSTRIP_FRAMES, Math.max(MIN_FILMSTRIP_FRAMES, wanted));
}

/**
 * Where to sample, in ascending order.
 *
 * The samples are slice *centres*, not edges: a clip's first frame is very often
 * black or a fade-in and its last frame lands on the same off-by-one
 * `lastFrameSeekTarget` exists to dodge, so sampling the ends would spend two of
 * a dozen tiles on the two least representative frames in the file.
 */
export function filmstripSampleTimes(durationSeconds: number): number[] {
  const count = filmstripFrameCount(durationSeconds);
  return Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * durationSeconds);
}

/**
 * How wide one tile is: whatever keeps the source's aspect at strip height, so
 * frames are never squashed. Bounded on both sides — a 32:9 source would
 * otherwise fit one tile per block, and a very tall one would fit fifty.
 */
export function filmstripTileWidth(dimensions: Pick<ClipDimensions, 'width' | 'height'>): number {
  const { width, height } = dimensions;
  if (!width || !height) return Math.round(FILMSTRIP_HEIGHT * (16 / 9));
  const natural = Math.round(FILMSTRIP_HEIGHT * (width / height));
  return Math.min(MAX_TILE_WIDTH, Math.max(MIN_TILE_WIDTH, natural));
}

export interface FilmstripTilesInput {
  /** The block's width in px — its trimmed duration on the track's scale. */
  blockWidth: number;
  tileWidth: number;
  /** The clip's trim, in source seconds. */
  trim: { start: number; end: number };
  /** Sample times of the decoded strip, ascending (`filmstripSampleTimes`). */
  times: number[];
}

/**
 * Which frame each tile of a block shows, left to right.
 *
 * The tiles are a fixed width and the last one is allowed to run past the
 * block's right edge for the container to clip — the same half-frame every
 * editor leaves at the end of a clip. Fitting them exactly would instead make
 * every tile a slightly different width, which reads as a rendering bug.
 */
export function filmstripTiles({ blockWidth, tileWidth, trim, times }: FilmstripTilesInput): number[] {
  if (blockWidth <= 0 || tileWidth <= 0 || times.length === 0) return [];

  const span = Math.max(0, trim.end - trim.start);
  const count = Math.ceil(blockWidth / tileWidth);
  return Array.from({ length: count }, (_, index) => {
    // The instant at the middle of this tile, mapped back onto the source.
    const fraction = Math.min(1, ((index + 0.5) * tileWidth) / blockWidth);
    return nearestIndex(times, trim.start + fraction * span);
  });
}

function nearestIndex(times: number[], target: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const distance = Math.abs(times[index] - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** A strip as the UI sees it: fixed slots, filled in as frames decode. */
export interface Filmstrip {
  times: number[];
  /** One entry per sample time; `undefined` until that frame has decoded. */
  frames: ReadonlyArray<string | undefined>;
  /** True once every frame has landed, or the decode gave up. */
  done: boolean;
}

/** The snapshot for a source nothing has asked about yet — a stable identity,
 *  because `useSyncExternalStore` compares snapshots by reference. */
const EMPTY: Filmstrip = { times: [], frames: [], done: false };

interface Entry {
  blob: Blob;
  snapshot: Filmstrip;
  listeners: Set<() => void>;
  /** Set when the decode loop stopped early because nothing was watching. */
  idle: boolean;
  running: boolean;
}

/**
 * Bounded so a long session over a large library cannot grow without limit;
 * oldest-first, which is Map insertion order. A dozen JPEG data URLs at strip
 * height is a few tens of KB, so this ceiling is generous rather than tight.
 */
const MAX_CACHED_STRIPS = 24;
const strips = new Map<string, Entry>();

export function filmstripSnapshot(key: string): Filmstrip {
  return strips.get(key)?.snapshot ?? EMPTY;
}

export function subscribeFilmstrip(key: string, listener: () => void): () => void {
  // The entry may not exist yet — `requestFilmstrip` runs in an effect, after
  // this. Park the listener on a placeholder rather than dropping it.
  const entry = strips.get(key);
  const listeners = entry ? entry.listeners : (pendingListeners.get(key) ?? new Set());
  if (!entry) pendingListeners.set(key, listeners);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (!entry && listeners.size === 0) pendingListeners.delete(key);
  };
}

/** Listeners that subscribed before anything requested the strip. */
const pendingListeners = new Map<string, Set<() => void>>();

function notify(entry: Entry) {
  for (const listener of entry.listeners) listener();
}

/**
 * Start (or resume) decoding a source's strip. Safe to call on every render of
 * every placement of the clip: an entry that is already complete, or already
 * decoding, is left alone.
 */
export function requestFilmstrip(key: string, blob: Blob, durationSeconds: number): void {
  let entry = strips.get(key);

  if (!entry) {
    const times = filmstripSampleTimes(durationSeconds);
    entry = {
      blob,
      snapshot: { times, frames: times.map(() => undefined), done: times.length === 0 },
      listeners: pendingListeners.get(key) ?? new Set(),
      idle: true,
      running: false,
    };
    pendingListeners.delete(key);
    strips.set(key, entry);

    if (strips.size > MAX_CACHED_STRIPS) evictOldestUnwatched(key);
  }

  // A synchronous notify is what makes a cache *hit* visible: the component
  // read its snapshot during render, before this effect ran, and a complete
  // strip that was already in the map would otherwise never announce itself.
  notify(entry);

  if (entry.snapshot.done || entry.running || !canDecodeFrames()) return;
  const target = entry;
  target.idle = false;
  target.running = true;
  void queued(() => decodeStrip(target));
}

/**
 * Makes room without dropping a strip something on screen is still reading —
 * an evicted entry keeps its listeners, so its subscribers would go deaf while
 * a replacement entry decoded into a set they are not in.
 */
function evictOldestUnwatched(keep: string): void {
  for (const [key, entry] of strips) {
    if (key === keep || entry.listeners.size > 0) continue;
    strips.delete(key);
    return;
  }
}


/**
 * Whether this environment can turn a video frame into an image at all.
 *
 * jsdom answers no (no 2d context, and a `<video>` there never reaches
 * `loadeddata`), which is the point: without this gate every timeline test
 * would leave a real seek timeout pending, and every block would sit waiting
 * for frames that can never arrive instead of falling back to its poster.
 */
function canDecodeFrames(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

/** At most this many sources decode at once — the rest wait their turn rather
 *  than putting a dozen `<video>` decoders on screen at the same moment. */
const MAX_CONCURRENT_DECODES = 2;
let active = 0;
const waiting: Array<() => void> = [];

async function queued(work: () => Promise<void>): Promise<void> {
  if (active >= MAX_CONCURRENT_DECODES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    await work();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const SEEK_TIMEOUT_MS = 6_000;

async function decodeStrip(entry: Entry): Promise<void> {
  const objectUrl = URL.createObjectURL(entry.blob);
  try {
    const video = await loadVideo(objectUrl);
    try {
      const canvas = document.createElement('canvas');
      for (let index = 0; index < entry.snapshot.times.length; index += 1) {
        // Nobody is watching any more — the workspace closed, or the clip was
        // removed. Stop where we are; the frames already decoded stay cached
        // and `requestFilmstrip` picks the loop back up if it comes back.
        if (entry.listeners.size === 0) {
          entry.idle = true;
          return;
        }
        if (entry.snapshot.frames[index]) continue;
        await seekTo(video, entry.snapshot.times[index]);
        fill(entry, index, drawFrame(video, canvas));
      }
    } finally {
      releaseVideo(video);
    }
  } catch {
    // A strip is decoration: a source this browser cannot decode keeps its
    // poster fallback, and the clip is still perfectly exportable (the server
    // engine decodes what ffmpeg does). Nothing to report.
  } finally {
    URL.revokeObjectURL(objectUrl);
    entry.running = false;
    if (!entry.idle) {
      entry.snapshot = { ...entry.snapshot, done: true };
      notify(entry);
    }
  }
}

function fill(entry: Entry, index: number, frame: string | undefined) {
  if (!frame) return;
  const frames = entry.snapshot.frames.slice();
  frames[index] = frame;
  entry.snapshot = { ...entry.snapshot, frames };
  notify(entry);
}

function drawFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | undefined {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return undefined;

  canvas.height = FRAME_HEIGHT;
  canvas.width = Math.max(1, Math.round(FRAME_HEIGHT * (videoWidth / videoHeight)));
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  // A data URL, not an object URL: the strips outlive the blocks that drew them
  // (they are cached per record for the session) and nothing would be left to
  // revoke a dozen object URLs per clip at the right moment.
  return canvas.toDataURL('image/jpeg', FRAME_QUALITY);
}

/**
 * The `<video>` plumbing below is a deliberate near-copy of `lib/video-frame.ts`
 * rather than an import of it: that module's contract is that a frame it cannot
 * read is an *error the user must see* (`FRAME_EXTRACTION_ERROR`), because its
 * frames become saved assets. A missing thumbnail is cosmetic, so this copy
 * resolves to nothing instead of rejecting, and gives up in seconds rather than
 * fifteen — the two failure policies cannot share one implementation without
 * one of them getting the wrong one.
 */
function loadVideo(objectUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const settle = (finish: () => void) => () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      finish();
    };
    const onLoaded = settle(() => resolve(video));
    const onError = settle(() => reject(new Error('filmstrip: video would not load')));

    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    const timer = setTimeout(onError, SEEK_TIMEOUT_MS);
    video.src = objectUrl;
  });
}

/** currentTime deltas below this never emit `seeked`, so awaiting one would hang. */
const SEEK_EPSILON = 1e-3;

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < SEEK_EPSILON) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const settle = (finish: () => void) => () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      finish();
    };
    const onSeeked = settle(resolve);
    const onError = settle(() => reject(new Error('filmstrip: seek failed')));

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    const timer = setTimeout(onError, SEEK_TIMEOUT_MS);
    video.currentTime = time;
  });
}

function releaseVideo(video: HTMLVideoElement) {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Teardown is best effort; revoking the object URL is what matters.
  }
}
