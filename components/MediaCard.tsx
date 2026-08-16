// components/MediaCard.tsx
'use client';

import Image, { type StaticImageData } from 'next/image';
import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * The picker card shared by the feature grid on the landing page and the input
 * mode grid in the video workspace: an optional badge row, a 16:9 thumbnail, a
 * title and description, optional meta pills, and a check badge when selected.
 *
 * The accent follows the surface the card sits on — cyan on the landing page,
 * purple in the video workspace, where the nav and provider cards are purple.
 */
const ACCENTS = {
  cyan: {
    selectedCard: 'border-[var(--neon-cyan)]/60 shadow-[var(--glow-cyan)]',
    check: 'bg-[var(--neon-cyan)]',
  },
  purple: {
    selectedCard: 'border-[var(--neon-purple)]/60 shadow-[var(--glow-purple)]',
    check: 'bg-[var(--neon-purple)]',
  },
} as const;

export type MediaCardAccent = keyof typeof ACCENTS;

interface MediaCardProps {
  title: string;
  description?: string;
  /**
   * A static import goes through next/image. A plain string is a remote URL —
   * the feature art is hosted on the vendors' doc sites, which would each need
   * a next.config `remotePatterns` entry to optimize, so those stay bare imgs.
   */
  thumbnail?: StaticImageData | string;
  thumbnailAlt?: string;
  /** Pills above the thumbnail. */
  badges?: ReactNode;
  /** Pills below the description. */
  meta?: ReactNode;
  selected?: boolean;
  accent?: MediaCardAccent;
  onClick: () => void;
  /** Set when the surrounding grid staggers its children in. */
  variants?: Variants;
  /** Width hint for next/image; unused by remote thumbnails. */
  sizes?: string;
}

export default function MediaCard({
  title,
  description,
  thumbnail,
  thumbnailAlt = '',
  badges,
  meta,
  selected = false,
  accent = 'cyan',
  onClick,
  variants,
  sizes = '(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw',
}: MediaCardProps) {
  const tone = ACCENTS[accent];

  return (
    <motion.button
      type="button"
      variants={variants}
      onClick={onClick}
      aria-pressed={selected}
      className={`glass-card group relative cursor-pointer overflow-hidden p-5 text-left sm:p-6 ${selected ? tone.selectedCard : ''}`}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
    >
      {badges && <div className="flex items-center justify-between gap-2">{badges}</div>}

      <div
        className={`relative mb-5 aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] ${badges ? 'mt-4' : ''}`}
      >
        {typeof thumbnail === 'string' ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote vendor art, see thumbnail prop
          <img
            src={thumbnail}
            alt={thumbnailAlt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : thumbnail ? (
          <Image
            src={thumbnail}
            alt={thumbnailAlt}
            fill
            sizes={sizes}
            placeholder="blur"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>

      <div className="space-y-2.5">
        <h3 className="display text-lg font-semibold text-[var(--foreground)] sm:text-xl">{title}</h3>

        {description && (
          <p className="line-clamp-3 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-[0.95rem]">
            {description}
          </p>
        )}

        {meta && <div className="flex flex-wrap gap-2 pt-1">{meta}</div>}
      </div>

      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`absolute bottom-4 right-4 flex h-7 w-7 items-center justify-center rounded-full ${tone.check}`}
        >
          <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}
