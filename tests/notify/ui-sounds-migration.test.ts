import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../../store/useAppStore';

const STORAGE_KEY = 'scene-assembly-store';

/**
 * `chimeOnComplete` became `uiSoundsEnabled` when the setting stopped being
 * named after the one sound the studio has. The rename is silently destructive
 * in the worse direction without a migration: the stored blob carries no
 * `uiSoundsEnabled`, so every existing user falls back to the default `true`
 * and anyone who deliberately silenced the studio starts hearing it again.
 *
 * These cover the version bump doing its job, because a migration that is only
 * claimed is not a migration.
 *
 * Every blob below carries `version: 0` because that is what zustand actually
 * wrote before this change: `version` defaults to 0 in the persist options and
 * is written into the payload, so a pre-rename blob is versioned even though
 * the store never named a version. That detail is load-bearing — zustand runs
 * `migrate` only when the stored version is a *number* that differs, so a blob
 * with no `version` key at all is skipped silently. It never writes one, but a
 * test that invents that shape proves nothing about real users.
 */
describe('the interface-sounds preference survives its rename', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('carries a deliberate mute across from the old key', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { apiKey: 'k', chimeOnComplete: false }, version: 0 })
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().uiSoundsEnabled).toBe(false);
  });

  it('carries an explicit opt-in across too, not just the mute', async () => {
    useAppStore.setState({ uiSoundsEnabled: false });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { chimeOnComplete: true }, version: 0 })
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().uiSoundsEnabled).toBe(true);
  });

  it('leaves a blob that never had the old key on the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { apiKey: 'k' }, version: 0 }));

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().uiSoundsEnabled).toBe(true);
  });

  it('does not let the old key override a value already migrated', async () => {
    // A post-rename blob carries version 1, so the migration must not run and
    // resurrect a stale `chimeOnComplete` that a later change contradicted.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { chimeOnComplete: true, uiSoundsEnabled: false }, version: 1 })
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().uiSoundsEnabled).toBe(false);
  });
});
