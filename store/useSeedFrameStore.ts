import { create } from 'zustand';

export interface SeedFrame {
  /** PNG extracted from the end of a finished clip, ready to upload as a reference. */
  file: File;
  /** Slug of the clip it came from, for the "continuing from…" label. */
  sourceLabel: string;
}

interface SeedFrameState {
  /**
   * Hand-off slot for starting a new clip from an existing one's last frame.
   * Deliberately a store rather than a prop: switching a workspace into
   * image-to-video remounts it, which would drop the frame mid-flight.
   */
  seed: SeedFrame | null;
  setSeedFrame: (seed: SeedFrame) => void;
  /** Consume the pending frame, if any. Reading it clears it. */
  takeSeedFrame: () => SeedFrame | null;
  clearSeedFrame: () => void;
}

export const useSeedFrameStore = create<SeedFrameState>((set, get) => ({
  seed: null,
  setSeedFrame: (seed) => set({ seed }),
  takeSeedFrame: () => {
    const { seed } = get();
    if (seed) set({ seed: null });
    return seed;
  },
  clearSeedFrame: () => set({ seed: null }),
}));
