/** Serializable contract shared by browser and Worker; never contains provider keys. */
export type CloudProvider = 'gemini' | 'fal' | 'kie' | 'runware' | 'atlas' | 'comet' | 'cloudflare' | 'pollinations' | 'local-test';
export interface CloudJobRequest {
  provider: CloudProvider;
  modelId: string;
  mediaType: 'image' | 'video';
  inputMode: 'text' | 'image' | 'frames' | 'reference';
  prompt: string;
  values: Record<string, string | number | boolean>;
  referenceIds: string[];
}
export type CloudJobState = 'queued' | 'submitting' | 'running' | 'saving' | 'saved' | 'needs_attention' | 'failed' | 'cancelled';
export interface CloudJobView {
  id: string; provider: CloudProvider; state: CloudJobState; errorCode: string | null;
  request: CloudJobRequest; createdAt: number; updatedAt: number;
}
export interface CloudAsset {
  id: string; kind: 'image' | 'video'; mimeType: string; bytes: number; createdAt: number;
  metadata: CloudJobRequest; jobId: string | null;
}
