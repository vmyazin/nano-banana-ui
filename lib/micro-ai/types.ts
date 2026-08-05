import type { MicroAiUsage } from '@/lib/micro-ai/models';

/** Which engine actually produced the answer, for telemetry and debugging. */
export type MicroAiSource = 'micro-ai' | 'gemini' | 'deterministic';

/** Usage block echoed to the browser. Absent unless micro-AI served the request. */
export interface MicroAiUsageReport extends MicroAiUsage {
  model: string;
}

export interface MicroAiEnvelope {
  source: MicroAiSource;
  usage?: MicroAiUsageReport;
}
