export type MediaType = 'image' | 'video';
export type KieInputMode = 'text' | 'image';
export type KieProtocol = 'market' | 'veo';
export type KieFieldType = 'text' | 'number' | 'boolean' | 'select' | 'file';

export interface KieFieldOption {
  label: string;
  value: string | number;
}

export interface KieFieldDefinition {
  key: string;
  label: string;
  type: KieFieldType;
  description?: string;
  defaultValue?: string | number | boolean;
  options?: KieFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}

export interface KieModelVariant {
  modelId: string;
  protocol: KieProtocol;
  inputMode: KieInputMode;
  imageInputKey?: string;
  imageInputMultiple?: boolean;
  maxInputImages?: number;
  fields: KieFieldDefinition[];
}

export interface KieModelDefinition {
  id: string;
  label: string;
  provider: string;
  description: string;
  mediaType: MediaType;
  variants: KieModelVariant[];
}

export interface KieTask {
  taskId: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  progress?: number;
  resultUrls: string[];
  error?: string;
}

export interface KieJob extends KieTask {
  id: string;
  modelId: string;
  mediaType: MediaType;
  inputMode: KieInputMode;
  protocol: KieProtocol;
  prompt: string;
  /** LLM-derived filename slug for downloads; absent until the model answers. */
  slug?: string;
  createdAt: number;
  updatedAt: number;
  pollAttempt: number;
}
