'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Shared account surface: existing tokens, one entrance, no perpetual animation. */
export function AccountSurface({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.section aria-label={label} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }} className={`relative overflow-hidden rounded-2xl border border-[var(--border-hover)] bg-[var(--background-elevated)] p-6 shadow-[0_16px_40px_-26px_rgba(0,0,0,0.85),0_10px_34px_-30px_color-mix(in_srgb,var(--brand-accent)_12%,transparent)] ${className}`}>
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent opacity-45" />
    {children}
  </motion.section>;
}
