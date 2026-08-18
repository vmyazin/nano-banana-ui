import { create } from 'zustand';

import type { DraftValue } from '@/lib/draft/carry-over';
import { measureImageUrl } from '@/lib/draft/reference-dimensions';

export interface DraftReference {
  /** Stable across provider switches, so React keys and removal survive a remount. */
  id: string;
  file: File;
  previewUrl: string;
  /** Present when the still was taken from a video rather than uploaded as-is. */
  sourceLabel?: string;
  /**
   * Natural pixel size, measured asynchronously after the reference is added.
   * Absent until the image decodes, and stays absent if it never does — the
   * size-matching effects treat that as "nothing to match against".
   */
  width?: number;
  height?: number;
}

export interface DraftReferenceInput {
  file: File;
  sourceLabel?: string;
}

interface DraftState {
  /**
   * What the user has typed and chosen, independent of which provider or mode
   * is on screen. Intentionally session-local and not persisted: it holds File
   * handles and object URLs, neither of which survive serialization.
   */
  prompt: string;
  references: DraftReference[];
  /** Last value seen per control key, replayed onto whatever model comes next. */
  controlValues: Record<string, DraftValue>;
  setPrompt: (prompt: string) => void;
  /** Appends up to `limit` total, dropping and revoking any that no longer fit. */
  addReferences: (entries: DraftReferenceInput[], limit: number) => void;
  /** Trims to a new model's ceiling, e.g. moving from a 3-image to a 1-image model. */
  limitReferences: (limit: number) => void;
  /** Moves one reference to another slot; order is meaningful for first/last frames. */
  reorderReference: (from: number, to: number) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;
  rememberControlValues: (values: Record<string, DraftValue>) => void;
  reset: () => void;
}

let nextReferenceId = 0;

function createReference({ file, sourceLabel }: DraftReferenceInput): DraftReference {
  nextReferenceId += 1;
  return {
    id: `draft-reference-${nextReferenceId}`,
    file,
    sourceLabel,
    previewUrl: URL.createObjectURL(file),
  };
}

/** The store owns every object URL it hands out, so only it may revoke one. */
function release(references: DraftReference[]) {
  for (const reference of references) URL.revokeObjectURL(reference.previewUrl);
}

export const useDraftStore = create<DraftState>((set, get) => ({
  prompt: '',
  references: [],
  controlValues: {},

  setPrompt: (prompt) => set({ prompt }),

  addReferences: (entries, limit) => {
    const created = entries.map(createReference);
    for (const reference of created) {
      void measureImageUrl(reference.previewUrl).then((dimensions) => {
        if (!dimensions) return;
        // The reference may have been dropped or trimmed while decoding.
        set((state) => ({
          references: state.references.map((candidate) =>
            candidate.id === reference.id ? { ...candidate, ...dimensions } : candidate
          ),
        }));
      });
    }
    const combined = [...get().references, ...created];
    if (combined.length <= limit) {
      set({ references: combined });
      return;
    }
    // Keep the most recent, since the newest pick is the one just asked for.
    const kept = combined.slice(combined.length - limit);
    release(combined.filter((reference) => !kept.includes(reference)));
    set({ references: kept });
  },

  limitReferences: (limit) => {
    const { references } = get();
    if (references.length <= limit) return;
    const kept = references.slice(references.length - limit);
    release(references.filter((reference) => !kept.includes(reference)));
    set({ references: kept });
  },

  reorderReference: (from, to) => {
    const { references } = get();
    const isInRange = (index: number) => Number.isInteger(index) && index >= 0 && index < references.length;
    if (from === to || !isInRange(from) || !isInRange(to)) return;
    const next = [...references];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ references: next });
  },

  removeReference: (id) => {
    const { references } = get();
    const removed = references.filter((reference) => reference.id === id);
    if (removed.length === 0) return;
    release(removed);
    set({ references: references.filter((reference) => reference.id !== id) });
  },

  clearReferences: () => {
    release(get().references);
    set({ references: [] });
  },

  rememberControlValues: (values) =>
    set((state) => ({ controlValues: { ...state.controlValues, ...values } })),

  reset: () => {
    release(get().references);
    set({ prompt: '', references: [], controlValues: {} });
  },
}));
