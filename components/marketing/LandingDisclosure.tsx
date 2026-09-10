// components/marketing/LandingDisclosure.tsx
'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The fold in the about section: a "Learn about …" button and the panel it
 * reveals. Collapsed by default so a returning visitor scrolling past the
 * picker meets one headline and a paragraph, not a wall of cards.
 *
 * The panel's children are server-rendered by `LandingIntro` and are always in
 * the DOM — collapsed means `grid-template-rows: 0fr` plus `inert`, never a
 * conditional render. That is the whole reason the section exists: a crawler
 * reads the engine list and the BYOK copy out of the HTML whether or not
 * anyone clicks, and the very same markup is what opens. `inert` (rather than
 * `aria-hidden` + tabindex juggling) takes the collapsed links out of the tab
 * order and the accessibility tree in one attribute.
 *
 * The reveal animates the grid row, not a measured height, so it needs no
 * layout read, survives content that reflows on resize, and collapses to a
 * plain jump under `prefers-reduced-motion`.
 */
export default function LandingDisclosure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="group mt-6 inline-flex items-center gap-2 rounded-lg text-[0.875rem] font-bold text-[var(--neon-cyan)] transition-colors hover:text-[var(--neon-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        {label}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </>
  );
}
