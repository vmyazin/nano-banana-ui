import { create } from 'zustand';

import type { MicroAiUsage } from '@/lib/micro-ai/models';
import { captureHelper } from '@/lib/spend/capture';

interface MicroAiUsageState {
  /** Intentionally session-local: usage is a readout, not an entitlement. */
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** Most recent model that served a micro-task, for the readout label. */
  lastModel: string;
  record: (usage: MicroAiUsage, model: string) => void;
  reset: () => void;
}

const EMPTY = {
  requests: 0,
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  lastModel: '',
};

export const useMicroAiUsageStore = create<MicroAiUsageState>((set) => ({
  ...EMPTY,
  record: (usage, model) => {
    captureHelper(usage, model);
    set((state) => ({
      requests: state.requests + 1,
      promptTokens: state.promptTokens + usage.promptTokens,
      completionTokens: state.completionTokens + usage.completionTokens,
      costUsd: state.costUsd + usage.costUsd,
      lastModel: model || state.lastModel,
    }));
  },
  reset: () => set({ ...EMPTY }),
}));
