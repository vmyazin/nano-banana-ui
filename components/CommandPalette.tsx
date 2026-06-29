'use client';

import { useEffect } from 'react';
import { Command } from 'cmdk';
import { useQueryState } from 'nuqs';
import { Sparkles, Home, Key } from 'lucide-react';
import { FEATURES } from '@/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenApiKey: () => void;
}

export function CommandPalette({ open, onOpenChange, onOpenApiKey }: CommandPaletteProps) {
  const [, setFeatureId] = useQueryState('feature', { history: 'push' });

  // ⌘K / Ctrl-K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const go = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      loop
    >
      <Command.Input placeholder="Jump to a feature or action…" />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Features">
          {FEATURES.map((f) => (
            <Command.Item
              key={f.id}
              value={`${f.name} ${f.id}`}
              onSelect={() => go(() => setFeatureId(f.id))}
            >
              <Sparkles size={15} />
              {f.name}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions">
          <Command.Item value="home start over" onSelect={() => go(() => setFeatureId(null))}>
            <Home size={15} />
            Go to home
          </Command.Item>
          <Command.Item value="api key gemini" onSelect={() => go(onOpenApiKey)}>
            <Key size={15} />
            Set API key
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
