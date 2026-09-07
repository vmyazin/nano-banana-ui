import { create } from 'zustand';

/**
 * Where each engine runs: in the browser, or as a background account job.
 *
 * This lived in `useCloudWorkspace` as component state, which meant it did not
 * survive a remount - and switching engine, switching input mode, or leaving a
 * feature and coming back all remount that workspace. Every return therefore
 * reverted to "Runs in the background", and a session spent working in the
 * browser paid the switch again on each visit.
 *
 * Session-scoped on purpose: a store rather than `useState` so it outlives a
 * remount, but deliberately not persisted, so a reload starts from the account
 * default rather than resurrecting a choice made hours ago under conditions
 * that may no longer hold.
 */
export type RunLocation = 'cloud' | 'browser';

/**
 * Keyed by owner as well as engine. The choice is a statement about running
 * *this account's* work in the browser, so it must not carry over when a
 * different account signs in - which is exactly what the `browserOwner!==owner`
 * comparison it replaces was for. Signed-out sessions share the `guest` key.
 */
export function runLocationKey(ownerId: string | null | undefined, provider: string) {
  return `${ownerId ?? 'guest'}:${provider}`;
}

interface RunLocationState {
  choices: Record<string, RunLocation>;
  choose: (ownerId: string | null | undefined, provider: string, location: RunLocation) => void;
  /** Test seam, and what a sign-out would use if we ever wire one up. */
  reset: () => void;
}

export const useRunLocationStore = create<RunLocationState>((set) => ({
  choices: {},
  choose: (ownerId, provider, location) =>
    set((state) => ({
      choices: { ...state.choices, [runLocationKey(ownerId, provider)]: location },
    })),
  reset: () => set({ choices: {} }),
}));
