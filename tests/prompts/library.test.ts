import { beforeEach, describe, expect, it } from 'vitest';

import { usePromptLibraryStore } from '../../store/usePromptLibraryStore';

const STORAGE_KEY = 'scene-assembly-prompts';

function reset() {
  localStorage.clear();
  usePromptLibraryStore.setState({ history: [], favourites: [], hasHydrated: false });
}

describe('usePromptLibraryStore', () => {
  beforeEach(reset);

  it('remembers what was submitted, newest first', () => {
    usePromptLibraryStore.getState().remember('A quiet ocean');
    usePromptLibraryStore.getState().remember('A neon tiger');

    expect(usePromptLibraryStore.getState().history.map((p) => p.text)).toEqual([
      'A neon tiger',
      'A quiet ocean',
    ]);
  });

  it('ignores blank submissions', () => {
    usePromptLibraryStore.getState().remember('   ');
    expect(usePromptLibraryStore.getState().history).toEqual([]);
  });

  it('trims before storing, so the same prompt is not recorded twice', () => {
    usePromptLibraryStore.getState().remember('A quiet ocean');
    usePromptLibraryStore.getState().remember('  A quiet ocean  ');

    expect(usePromptLibraryStore.getState().history).toHaveLength(1);
  });

  it('moves a repeated prompt back to the top rather than duplicating it', () => {
    usePromptLibraryStore.getState().remember('first');
    usePromptLibraryStore.getState().remember('second');
    usePromptLibraryStore.getState().remember('first');

    expect(usePromptLibraryStore.getState().history.map((p) => p.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('caps history so a long session cannot grow without bound', () => {
    for (let index = 0; index < 120; index += 1) {
      usePromptLibraryStore.getState().remember(`prompt ${index}`);
    }

    const { history } = usePromptLibraryStore.getState();
    expect(history).toHaveLength(100);
    expect(history[0].text).toBe('prompt 119');
  });

  it('stars and unstars a prompt', () => {
    usePromptLibraryStore.getState().toggleFavourite('A brass diving bell');
    expect(usePromptLibraryStore.getState().isFavourite('A brass diving bell')).toBe(true);

    usePromptLibraryStore.getState().toggleFavourite('A brass diving bell');
    expect(usePromptLibraryStore.getState().favourites).toEqual([]);
  });

  it('keeps a starred prompt when history is cleared', () => {
    usePromptLibraryStore.getState().remember('A brass diving bell');
    usePromptLibraryStore.getState().toggleFavourite('A brass diving bell');

    usePromptLibraryStore.getState().clearHistory();

    expect(usePromptLibraryStore.getState().history).toEqual([]);
    expect(usePromptLibraryStore.getState().favourites.map((p) => p.text)).toEqual([
      'A brass diving bell',
    ]);
  });

  it('survives a reload through localStorage', async () => {
    usePromptLibraryStore.getState().remember('A quiet ocean');
    usePromptLibraryStore.getState().toggleFavourite('A quiet ocean');

    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
    const persisted = JSON.parse(raw);
    expect(persisted.state.history[0].text).toBe('A quiet ocean');
    expect(persisted.state.favourites[0].text).toBe('A quiet ocean');

    // Simulate a fresh tab. setState re-persists, so the blob is put back
    // before rehydrating — otherwise the wipe would erase what we are testing.
    usePromptLibraryStore.setState({ history: [], favourites: [], hasHydrated: false });
    localStorage.setItem(STORAGE_KEY, raw);
    await usePromptLibraryStore.persist.rehydrate();

    expect(usePromptLibraryStore.getState().history.map((p) => p.text)).toEqual(['A quiet ocean']);
    expect(usePromptLibraryStore.getState().hasHydrated).toBe(true);
  });

  it('forgets a single entry from both lists', () => {
    usePromptLibraryStore.getState().remember('A quiet ocean');
    const [entry] = usePromptLibraryStore.getState().history;

    usePromptLibraryStore.getState().forget(entry.id);

    expect(usePromptLibraryStore.getState().history).toEqual([]);
  });
});
