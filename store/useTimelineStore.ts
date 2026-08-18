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

/**
 * Enough history to undo the destructive edits — removing a clip, or clearing
 * the timeline — which are the ones you cannot reconstruct by hand: an
 * imported clip is pinned with no source URL, so a removed placement of it can
 * only be put back from memory of what was there.
 *
 * Deliberately shallow: fit changes and reorders are visible and trivially
 * reversible, so pushing them would bury the one entry that matters under
 * noise. Capped, because a session of edits should not grow without bound.
 */
const HISTORY_LIMIT = 20;

interface TimelineState {
  timeline: Timeline;
  /** Past timelines, newest last. Never persisted — undo is a session affordance. */
  history: Timeline[];
  /** What the next undo would put back, for labelling the control. */
  undoLabel: string | null;
  undo: () => void;
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

      /** An edit that can be undone: the timeline before it is kept first. */
      const destructiveEdit = (label: string, change: (timeline: Timeline) => Timeline) =>
        set((state) => ({
          timeline: { ...change(state.timeline), updatedAt: Date.now() },
          history: [...state.history, state.timeline].slice(-HISTORY_LIMIT),
          undoLabel: label,
        }));

      return {
        timeline: emptyTimeline(),
        history: [],
        undoLabel: null,

        undo: () =>
          set((state) => {
            const previous = state.history[state.history.length - 1];
            if (!previous) return state;
            const history = state.history.slice(0, -1);
            return {
              timeline: previous,
              history,
              // The label describes the *next* undo, so it can only be known
              // for the entry still on the stack — and there is no record of
              // what that one was, so undoing twice is offered unlabelled.
              undoLabel: history.length > 0 ? 'the last change' : null,
            };
          }),

        addClip: (recordId) => {
          const id = placementId();
          edit((timeline) => ({
            ...timeline,
            clips: [...timeline.clips, { id, recordId, fit: 'contain' }],
          }));
          return id;
        },

        removeClip: (clipId) =>
          destructiveEdit('the removed clip', (timeline) => ({
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

        clear: () =>
          set((state) => ({
            timeline: emptyTimeline(),
            // Clearing a timeline you spent an afternoon on is the single most
            // expensive click here, so it is undoable like any removal.
            history:
              state.timeline.clips.length > 0
                ? [...state.history, state.timeline].slice(-HISTORY_LIMIT)
                : state.history,
            undoLabel: state.timeline.clips.length > 0 ? 'the cleared timeline' : state.undoLabel,
          })),
      };
    },
    {
      name: 'scene-assembly-timeline',
      storage: createJSONStorage(() => localStorage),
      // Only the timeline itself survives a reload. A restored undo stack
      // would offer to put back clips whose bytes were evicted in the
      // meantime, which is a promise this store cannot keep.
      partialize: (state) => ({ timeline: state.timeline }),
    }
  )
);
