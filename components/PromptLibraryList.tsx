'use client';

import { Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useDraftStore } from '@/store/useDraftStore';
import { usePromptLibraryStore, type SavedPrompt } from '@/store/usePromptLibraryStore';

export default function PromptLibraryList({ onInserted }: { onInserted?: () => void }) {
  const history = usePromptLibraryStore((state) => state.history);
  const favourites = usePromptLibraryStore((state) => state.favourites);

  const insert = (prompt: SavedPrompt) => {
    useDraftStore.getState().setPrompt(prompt.text);
    toast.success('Prompt loaded');
    onInserted?.();
  };

  const rows = (prompts: SavedPrompt[], starred: boolean) =>
    prompts.map((prompt) => (
      <li
        key={prompt.id}
        className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)]/60 p-2.5"
      >
        <button
          type="button"
          onClick={() => insert(prompt)}
          className="min-w-0 flex-1 text-left text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          title="Load this prompt"
        >
          <span className="line-clamp-2">{prompt.text}</span>
        </button>
        <button
          type="button"
          onClick={() => usePromptLibraryStore.getState().toggleFavourite(prompt.text)}
          aria-label={starred ? `Unstar ${prompt.text}` : `Star ${prompt.text}`}
          className={`shrink-0 rounded-md border border-[var(--border)] p-1.5 ${starred ? 'text-amber-300' : 'text-[var(--foreground-muted)] hover:text-amber-300'}`}
        >
          <Star size={13} fill={starred ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={() => usePromptLibraryStore.getState().forget(prompt.id)}
          aria-label={`Delete ${prompt.text}`}
          className="shrink-0 rounded-md border border-[var(--border)] p-1.5 text-[var(--foreground-muted)] hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </li>
    ));

  if (history.length === 0 && favourites.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">
        Prompts you submit are remembered here. Nothing yet.
      </p>
    );
  }

  return (
    <div className="space-y-3.5">
      {favourites.length > 0 && (
        <section className="space-y-2">
          <p className="eyebrow">Starred</p>
          <ul className="space-y-2">{rows(favourites, true)}</ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Recent</p>
            <button
              type="button"
              onClick={() => usePromptLibraryStore.getState().clearHistory()}
              className="text-xs text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"
            >
              Clear history
            </button>
          </div>
          <ul className="space-y-2">{rows(history, false)}</ul>
        </section>
      )}
    </div>
  );
}
