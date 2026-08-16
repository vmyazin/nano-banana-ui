'use client';

import { useRef, type KeyboardEvent } from 'react';
import ProviderLogo from '@/components/ProviderLogo';

export type VideoProvider = 'kie' | 'fal';

interface ProviderSelectorProps {
  value: VideoProvider;
  onChange: (provider: VideoProvider) => void;
}

const providers = [
  // No blurbs: the model counts they carried drifted from the catalogs, and a
  // provider's name is the whole of what this control chooses.
  { id: 'kie' as const, label: 'Kie.ai' },
  { id: 'fal' as const, label: 'fal.ai' },
];

export default function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % providers.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + providers.length) % providers.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = providers.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    onChange(providers[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Video provider"
      className="grid gap-2 sm:grid-cols-2"
    >
      {providers.map((provider, index) => {
        const selected = provider.id === value;
        return (
          <button
            key={provider.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            ref={(element) => { buttonRefs.current[index] = element; }}
            onClick={() => onChange(provider.id)}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
            className={`rounded-xl border px-4 py-3.5 text-left transition-colors ${selected ? 'border-[var(--neon-purple)] bg-[var(--neon-purple)]/10' : 'border-[var(--border)] bg-[var(--background-elevated)]/60 hover:border-[var(--foreground-subtle)]'}`}
          >
            <span className="flex items-center gap-2.5 text-base font-semibold text-[var(--foreground)] sm:text-lg">
              <ProviderLogo provider={provider.id} size={22} />
              {provider.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
