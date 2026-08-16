# Compact UI density

Status: Approved design

## Context

The interface was sized a full step larger than comparable tools. Concretely, on
`main` at 82c07bb:

- `input, textarea, select` ran at `font-size: 1rem` with `0.65rem 0.9rem`
  padding — a ~44px control.
- `.btn-primary` / `.btn-secondary` declared no `font-size` at all, so a bare
  `<button>` fell back to the UA default (13.33px) while a caller that added
  `text-sm` got 14px. Identical buttons rendered at different heights.
- `.field-label` was `1.0625rem` (17px) — larger than the body text it labelled,
  so every form row opened with something that read as a heading.
- The landing stack was `space-y-10 sm:space-y-12 md:space-y-14` (40/48/56px)
  between sections, on top of `py-6 sm:py-8 md:py-10` on `<main>`.
- Mode/feature cards were `p-5 sm:p-6` with a `mb-5` thumbnail and a
  `line-clamp-3` description, and only reached three per row at `xl` (1280px).

### Reference

manus.im, named by the user. Its production CSS was pulled and read rather than
recalled. Because it ships Tailwind v3 with JIT, the emitted utility set *is*
the used set. What that shows:

- `text-sm` (14px) appears 48 times in the served markup against a single
  `text-xs` — 14px is the base UI face, not 16px.
- Controls land on `h-8` (32px), `h-9` (36px, `px-3 py-1.5`) and `h-10`
  (40px, `px-[14px] py-[7px]`).
- Borders are hairlines: `--border-main: #0000000f`.
- Radii are `rounded-full` for pills and `rounded-[8px]` for rectangles.

## Goals

1. Compress vertical spacing first — it is the stated primary concern.
2. Put every button, input and select on one shared control height.
3. Fit up to three mode thumbnail cards per row at tablet width (`md`, 768px).

## Non-goals

- No palette, accent, gradient or ambient-background changes. The neon accents,
  the grid canvas and the top glow all stay exactly as they are.
- No copy changes, no component extraction, no restructuring of any layout.
- No fix for the two pre-existing `tests/video-workspace.test.tsx` failures.
  They fail identically on unmodified `main` and are out of scope here.
- Not switching the app to a light theme. Manus is the density reference only.

## Scope and implementation boundary

The density system lives in `app/globals.css` `:root` and the element rules
below it. Everything else is a caller of those tokens.

May be modified:

- `app/globals.css` — tokens, `.btn-*`, `.pill`, `.field-*`, input rules, cmdk.
- `app/page.tsx` — header, hero, main, footer rhythm.
- `components/MediaCard.tsx` — card padding, type, thumbnail gap, check badge.
- `components/FeatureSelector.tsx`, `components/VideoWorkspace.tsx` — the grids.
- The remaining `components/*.tsx` — one uniform spacing/type step down.

Must not be touched:

- `lib/`, `store/`, `types/`, `app/api/` — no behavior, state or data changes.
- Any `aria-*`, `role`, `title` or element text. The accessible name of every
  control must survive, because the suite queries controls by accessible name.
- The `--neon-*`, `--brand-accent`, `--electric-blue` and `--gradient-*` values.
