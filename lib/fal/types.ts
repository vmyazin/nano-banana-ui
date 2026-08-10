export type FalMediaType = 'image' | 'video';
/** `frames` is first-and-last-frame to video: two ordered source images. */
export type FalInputMode = 'text' | 'image' | 'frames';
export type FalValue = string | number | boolean;
export type FalFieldType = 'text' | 'number' | 'boolean' | 'select';

export interface FalFieldOption {
  label: string;
  value: string | number;
}

export interface FalFieldDefinition {
  key: string;
  label: string;
  type: FalFieldType;
  description?: string;
  defaultValue?: FalValue;
  options?: FalFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface FalModelVariant {
  id: string;
  endpointId: string;
  inputMode: FalInputMode;
  imageInputKey?: 'image_url' | 'image_urls' | 'start_image_url';
  imageInputMultiple?: boolean;
  maxInputImages?: number;
  /**
   * Where the opening and closing stills go on a `frames` variant. The two keys
   * differ per model — Veo takes `first_frame_url`/`last_frame_url` on its own
   * endpoint, while the rest hang `end_image_url` off image-to-video.
   */
  frameInputKeys?: { first: string; last: string };
  fields: FalFieldDefinition[];
}

export interface FalModelDefinition {
  id: string;
  label: string;
  provider: string;
  description: string;
  mediaType: FalMediaType;
  variants: FalModelVariant[];
}

export type FalTaskState = 'queued' | 'running' | 'success' | 'fail' | 'timed_out' | 'cancelled';

export interface FalTask {
  requestId: string;
  state: FalTaskState;
  logs: string[];
  resultUrl?: string;
  mimeType?: string;
  error?: string;
}

export interface FalJob extends FalTask {
  id: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  prompt: string;
  /** LLM-derived filename slug for downloads; absent until the model answers. */
  slug?: string;
  /** Controls this ran with, snapshotted so a past run can be restored. */
  controlValues?: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
  pollAttempt: number;
}
