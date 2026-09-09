import { create } from 'zustand';

import type { EngineId } from '@/lib/engines/registry';

/**
 * Whether the API-connections dialog is open, and which engine it should open
 * focused on.
 *
 * A store rather than page state because the dialog now belongs to
 * `StudioHeader`, which renders on more than one route, while the things that
 * *ask* for it are scattered: the header's own CTA and ⌘K open it plain, and a
 * workspace that is missing a key opens it focused on that provider
 * (`focusProvider` is what outlines the card and focuses its field). Passing a
 * callback down would mean every route re-declaring the dialog, which is the
 * duplicate the extraction exists to remove.
 */
interface ConnectionsDialogState {
  open: boolean;
  /** The engine whose card should open outlined and focused, if any. */
  focusProvider: EngineId | undefined;
  /** Opens the dialog; pass an engine to aim it at that provider's card. */
  openConnections: (provider?: EngineId) => void;
  setOpen: (open: boolean) => void;
}

export const useConnectionsDialog = create<ConnectionsDialogState>()((set) => ({
  open: false,
  focusProvider: undefined,
  openConnections: (provider) => set({ open: true, focusProvider: provider }),
  // The focus is cleared on close, not on open: reopening from the header CTA
  // must not inherit whichever provider a workspace last aimed it at.
  setOpen: (open) => set(open ? { open } : { open, focusProvider: undefined }),
}));
