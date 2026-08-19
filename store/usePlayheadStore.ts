import { create } from 'zustand';

/**
 * The one playback clock shared by the preview and the track.
 *
 * The preview owns the media elements and remains the only thing that *plays*;
 * this store is how the two surfaces agree on where the playhead is. It is
 * deliberately not persisted — a playhead position is a session gesture, not
 * timeline data, which also keeps useTimelineStore's persistence untouched.
 *
 * `setTime` and `seek` both move the clock, but they answer different
 * questions: `setTime` is the playback engine reporting where it already is
 * (nothing needs to react), while `seek` is a surface asking playback to go
 * somewhere. `seekSeq` is what tells them apart — the preview effects on it,
 * so a timeupdate never re-seeks the element that produced it.
 */
interface PlayheadState {
  time: number;
  playing: boolean;
  /** Bumped by every seek(); the playback engine watches this, never `time`. */
  seekSeq: number;
  /** The engine reporting progress. Moves the clock without requesting a seek. */
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  /** A scrub from any surface: moves the clock and asks the engine to follow. */
  seek: (time: number) => void;
  reset: () => void;
}

export const usePlayheadStore = create<PlayheadState>()((set) => ({
  time: 0,
  playing: false,
  seekSeq: 0,
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  seek: (time) => set((state) => ({ time, seekSeq: state.seekSeq + 1 })),
  reset: () => set({ time: 0, playing: false, seekSeq: 0 }),
}));
