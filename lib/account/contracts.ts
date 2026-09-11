/** Serializable contract shared by browser and Worker; never contains provider keys. */
export type CloudProvider = 'gemini' | 'fal' | 'kie' | 'runware' | 'atlas' | 'comet' | 'piapi' | 'cloudflare' | 'pollinations' | 'local-test';
export interface CloudJobRequest {
  provider: CloudProvider;
  modelId: string;
  mediaType: 'image' | 'video';
  inputMode: 'text' | 'image' | 'frames' | 'reference' | 'edit';
  prompt: string;
  values: Record<string, string | number | boolean>;
  referenceIds: string[];
  sourceVideoId?: string;
}
export type CloudJobState = 'queued' | 'submitting' | 'running' | 'saving' | 'saved' | 'needs_attention' | 'failed' | 'cancelled';
export interface CloudJobView {
  id: string; provider: CloudProvider; state: CloudJobState; errorCode: string | null;
  request: CloudJobRequest; createdAt: number; updatedAt: number;
}
export interface CloudAssetCounts {
  /** Account-wide, never page-scoped: the pills must keep saying how much sits
   *  behind each filter while you are inside a filtered, paged view. */
  all: number; image: number; video: number; temporary: number;
}
export interface CloudAsset {
  id: string; kind: 'image' | 'video'; mimeType: string; bytes: number; createdAt: number;
  metadata: CloudJobRequest; jobId: string | null;
  /** Present only for overflow awaiting space in the permanent library. */
  expiresAt?: number;
}

/** Every temporary input must share the same ownership and retention lifecycle. */
export function jobInputIds(request: Pick<CloudJobRequest, 'referenceIds' | 'sourceVideoId'>): string[] {
  return [...request.referenceIds, ...(request.sourceVideoId ? [request.sourceVideoId] : [])];
}
