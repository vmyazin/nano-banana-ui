import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TimelineClip {
  /** This placement. The same record may appear more than once. */
  id: string;
  recordId: string;
  fit: 'contain' | 'cover';
  // slice 2: trimStart?, trimEnd?   slice 4: gain?, muted?
}

export interface TimelineOutput {
  width: number;
  height: number;
  fps: number;
  /** True while the format tracks the clips; false once the user edits it. */
  auto: boolean;
}

export interface Timeline {
  id: string;
  name: string;
  clips: TimelineClip[];
  output: TimelineOutput;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true };

let placementCounter = 0;
function placementId() {
  placementCounter += 1;
  return `clip-${Date.now()}-${placementCounter}`;
}

function emptyTimeline(): Timeline {
  const now = Date.now();
  return {
    id: `timeline-${now}`,
    name: 'Untitled timeline',
    clips: [],
    output: { ...DEFAULT_OUTPUT },
    createdAt: now,
    updatedAt: now,
  };
}

interface TimelineState {
  timeline: Timeline;
  addClip: (recordId: string) => string;
  removeClip: (clipId: string) => void;
  /**
   * Id-based, not index-based: two drag surfaces plus async state updates make a
   * stale `from` index the easy bug to write and the hard one to reproduce.
   */
  moveClip: (clipId: string, toIndex: number) => void;
  setFit: (clipId: string, fit: 'contain' | 'cover') => void;
  /** Any user edit freezes the derived format. */
  setOutput: (patch: Partial<Omit<TimelineOutput, 'auto'>>) => void;
  /** Applies a derived format without unfreezing; used by the auto recompute. */
  applyDerivedOutput: (output: Omit<TimelineOutput, 'auto'>) => void;
  /** "I fiddled and want the automatic answer back." */
  matchClips: () => void;
  clear: () => void;
}

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set) => {
      const edit = (change: (timeline: Timeline) => Timeline) =>
        set((state) => ({ timeline: { ...change(state.timeline), updatedAt: Date.now() } }));

      return {
        timeline: emptyTimeline(),

        addClip: (recordId) => {
          const id = placementId();
          edit((timeline) => ({
            ...timeline,
            clips: [...timeline.clips, { id, recordId, fit: 'contain' }],
          }));
          return id;
        },

        removeClip: (clipId) =>
          edit((timeline) => ({
            ...timeline,
            clips: timeline.clips.filter((clip) => clip.id !== clipId),
          })),

        moveClip: (clipId, toIndex) =>
          edit((timeline) => {
            const from = timeline.clips.findIndex((clip) => clip.id === clipId);
            if (from === -1) return timeline;
            const clips = [...timeline.clips];
            const [moved] = clips.splice(from, 1);
            clips.splice(Math.max(0, Math.min(toIndex, clips.length)), 0, moved);
            return { ...timeline, clips };
          }),

        setFit: (clipId, fit) =>
          edit((timeline) => ({
            ...timeline,
            clips: timeline.clips.map((clip) => (clip.id === clipId ? { ...clip, fit } : clip)),
          })),

        setOutput: (patch) =>
          edit((timeline) => ({
            ...timeline,
            output: { ...timeline.output, ...patch, auto: false },
          })),

        applyDerivedOutput: (output) =>
          edit((timeline) =>
            timeline.output.auto ? { ...timeline, output: { ...output, auto: true } } : timeline
          ),

        matchClips: () =>
          edit((timeline) => ({ ...timeline, output: { ...timeline.output, auto: true } })),

        clear: () => set({ timeline: emptyTimeline() }),
      };
    },
    {
      name: 'scene-assembly-timeline',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
