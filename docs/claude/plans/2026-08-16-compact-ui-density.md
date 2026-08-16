# Plan: compact UI density

Spec: `docs/claude/specs/2026-08-16-compact-ui-density.md`

## File map

| Path | Target | Change |
| --- | --- | --- |
| `app/globals.css` | `:root` 38-56 | Add `--text-ui`, `--text-ui-sm`, `--control-py/px/h/h-sm`; `--radius` 14→11px, `--radius-sm` 9→8px |
| `app/globals.css` | `.field-*` | All three onto the `--text-ui` ramp |
| `app/globals.css` | `.pill`, `.btn-primary`, `.btn-secondary` | Explicit `font-size`, `min-height: var(--control-h)` |
| `app/globals.css` | `input, textarea, select` | Token padding/size + `min-height` on single-line fields only |
| `app/globals.css` | `.image-grid`, `[cmdk-*]`, `.loading-spinner` | Step down |
| `app/page.tsx` | header, hero, `<main>`, footer | Rhythm pass |
| `components/MediaCard.tsx` | 63-125 | `p-3 sm:p-3.5`, `mb-2.5` thumb, `line-clamp-2`, smaller check |
| `components/FeatureSelector.tsx` | 37 | `sm:grid-cols-2 md:grid-cols-3` |
| `components/VideoWorkspace.tsx` | 124 | Flex widths matching that grid |
| Remaining `components/*.tsx` | — | Scripted uniform step down |

Do not modify: `lib/`, `store/`, `types/`, `app/api/`, `app/layout.tsx`,
`app/providers.tsx`, `tests/`, any `next.config.ts` or lint config.

## Tasks

- [x] **Tokens.** Add the control scale to `:root`; tighten both radii.
      Verify: `grep -n 'control-h' app/globals.css`.
- [x] **Controls.** Give `.btn-primary`/`.btn-secondary` an explicit
      `font-size` and shared `min-height`; move inputs onto the tokens. Exclude
      `textarea` from `min-height` so it still sizes to its rows, and exclude
      checkbox/radio/range so they are not stretched to 36px.
      Verify: `npx tsc --noEmit`.
- [x] **Labels.** `.field-label` → `--text-ui` at weight 600, `.field-sublabel`
      and `.field-hint` → `--text-ui-sm`.
- [x] **Page rhythm.** Header `py-3.5 md:py-4` → `py-2 md:py-2.5`; main
      `py-6/8/10` → `py-4/5/6`; picker stack `space-y-10/12/14` → `space-y-5/6`;
      hero heading `text-4xl/5xl/6xl` → `text-2xl/3xl/4xl`; footer
      `mt-10/12/16` + `py-8/10/12` → `mt-8/10` + `py-6/7`.
- [x] **Card.** `MediaCard` padding, type, thumbnail gap, `line-clamp-2`,
      20px check badge, and a `sizes` hint matching the new breakpoints.
- [x] **Grids to 3-up at tablet.** `FeatureSelector` to
      `sm:grid-cols-2 md:grid-cols-3`; `VideoWorkspace` flex widths to
      `sm:*:w-[calc(50%-8px)] md:*:w-[calc(33.333%-11px)]` — the subtrahend is
      the row's share of the 16px gap (32px over three tracks ≈ 11px).
      Verify: screenshot at 768px shows three cards per row.
- [x] **Uniform step down elsewhere.** One scripted single-pass substitution so
      the type ramp does not cascade (`text-2xl` must land on `text-xl`, not
      fall through to `text-sm`). 131 replacements.
- [x] **Repair inverted ramps.** The step mapped `-5` onto `-3.5`, which sits
      *below* `-4`, so every existing `X-4 sm:X-5 md:X-6` ramp came out as
      `X-4 sm:X-3.5 md:X-4` — tablet tighter than phone. 21 fixes.
      Verify: `grep -rhoE '\b(p|px|py|gap|space-y)-[0-9.]+ (sm|md):...'` — every
      surviving ramp ascends.
- [x] **Badge wrapping.** `whitespace-nowrap` on the card badges; at a 208px
      card "Gemini 3 Pro" was breaking mid-phrase.
- [x] **Verify.** `npx tsc --noEmit` clean; `npx vitest run` → 669 passed, the
      same 2 `video-workspace` failures that `git stash` confirms are already
      failing on unmodified `main`; screenshots at 768 / 820 / 1440.

## Follow-up decision (2026-08-16)

Three-up was specified for `md` (768px), not `lg`. Checked rather than assumed:
at 768px the container is `768 - 96` (`md:px-12`) = 672px, so a track is
`672/3 - 11` ≈ 213px, leaving a 185px-wide thumbnail. That is wide enough, so
the breakpoint stays at `md` and `xl:grid-cols-3` is dropped rather than kept
as a fourth rung.
