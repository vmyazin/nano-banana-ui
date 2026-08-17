import type { TimelineOutput } from '@/store/useTimelineStore';

export interface RenderRequest {
  output: TimelineOutput;
  clips: Array<{
    media: Blob;
    fit: 'contain' | 'cover';
    /**
     * Human name for this clip, used only when an engine has to say which one
     * failed. Optional because a render is perfectly well-defined without it —
     * an engine falls back to the clip's position. "Clip 3" is a poor answer
     * on a timeline holding the same record twice.
     */
    label?: string;
  }>;
}

export interface RenderProgress {
  phase: 'preparing' | 'encoding' | 'muxing' | 'uploading';
  /** 0..1, or null where the phase cannot report fractions. */
  completed: number | null;
}

export interface RenderEngine {
  readonly id: 'webcodecs' | 'server';
  /** Why this engine cannot run this request here, or null when it can. */
  unavailableReason(request: RenderRequest): Promise<string | null>;
  render(
    request: RenderRequest,
    opts: { signal: AbortSignal; onProgress: (p: RenderProgress) => void }
  ): Promise<Blob>;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/**
 * Where a source frame lands inside the output frame. Shared by both engines so
 * a letterboxed clip sits in the same place whichever one rendered it.
 */
export function fitRect(source: Size, output: Size, fit: 'contain' | 'cover'): Rect {
  const scale =
    fit === 'contain'
      ? Math.min(output.width / source.width, output.height / source.height)
      : Math.max(output.width / source.width, output.height / source.height);

  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  return {
    x: Math.round((output.width - width) / 2),
    y: Math.round((output.height - height) / 2),
    width,
    height,
  };
}

export interface EngineSelection {
  chosen: RenderEngine | null;
  /** Kept so the UI can explain rather than fail generically. */
  rejected: Array<{ id: RenderEngine['id']; reason: string }>;
}

/** First engine that can run wins; order the array by preference (browser first). */
export async function selectRenderEngine(
  engines: RenderEngine[],
  request: RenderRequest
): Promise<EngineSelection> {
  const rejected: EngineSelection['rejected'] = [];

  for (const engine of engines) {
    const reason = await engine.unavailableReason(request);
    if (reason === null) return { chosen: engine, rejected };
    rejected.push({ id: engine.id, reason });
  }

  return { chosen: null, rejected };
}
