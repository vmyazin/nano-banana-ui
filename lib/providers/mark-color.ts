import type { EngineId } from '@/lib/engines/registry';

/**
 * A stable accent per provider, derived from the id rather than configured.
 *
 * `ENGINES` carries no colour field, and hand-assigning eight would have to be
 * revisited every time a provider is added — the ninth would either collide or
 * get whatever was left. Hashing the id instead means a new engine lands on a
 * colour the moment it exists.
 *
 * The hash picks from the Scene Assembly accent set rather than a free hue:
 * DESIGN.md reserves these colours for "actions, selection, provider identity,
 * and state", and an arbitrary HSL rotation would put off-palette colours in a
 * UI whose whole premise is that bright colours are rare and meaningful.
 */
const ACCENTS = [
  'var(--neon-cyan)',
  'var(--neon-purple)',
  'var(--neon-pink)',
  'var(--brand-accent)',
  'var(--electric-blue)',
] as const;

export function providerAccent(id: EngineId | string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}
