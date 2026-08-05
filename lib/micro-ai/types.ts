import type { MicroAiUsage } from '@/lib/micro-ai/models';

/** Which engine actually produced the answer, for telemetry and debugging. */
export type MicroAiSource = 'micro-ai' | 'gemini' | 'deterministic';

export interface MicroAiEnvelope {
  source: MicroAiSource;
  /** Model that answered. Absent only for the deterministic fallback. */
  model?: string;
  /** Token counts and cost. Absent unless the shared tier served the request. */
  usage?: MicroAiUsage;
}
