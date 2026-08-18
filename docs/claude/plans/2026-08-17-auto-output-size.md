# Plan: auto-select output size from the reference image

Spec: `docs/claude/specs/2026-08-17-auto-output-size-design.md`

## File map

- `store/useDraftStore.ts` — `DraftReference` type, `addReferences`, new
  `setReferenceDimensions`.
- `lib/draft/reference-dimensions.ts` — new: measure an image File/object URL.
- `lib/draft/aspect-match.ts` — new: ratio parsing, closest-option pick,
  `useAutoAspect` hook.
- `components/GenerationInterface.tsx` (~L182–200) — hook into `applyConfig`.
- `components/ProviderVideoWorkspace.tsx` (~L225) — hook into `updateValues`,
  candidates from `selectedModel.sizes`.
- `components/FalGenerationWorkspace.tsx` (~L341) — hook into `updateValue`,
  candidates from the variant's `aspect_ratio` field options.
- `components/KieGenerationWorkspace.tsx` (~L164) — same as fal.
- `AGENTS.md` — document the worktree bootstrap copies (node_modules symlink,
  `.env.local`, `next-env.d.ts`, `public/thumbnails`).

Do not modify: `lib/*/catalog.ts`, `components/ModelControls.tsx`,
`app/api/**`, submission builders inside the workspaces.

## Tasks

- [ ] Store: dimensions on `DraftReference`, measured async on add.
      Verify: `npx vitest run tests/draft`
- [ ] `aspect-match.ts`: `parseAspect`, `closestAspectCandidate`,
      `useAutoAspect(reference, candidates, apply)`.
      Verify: `npx vitest run tests/draft/aspect-match.test.ts`
- [ ] Wire the four workspaces.
      Verify: `npx tsc --noEmit && npx vitest run`
- [ ] Smoke-test in dev server on a non-default port; hand over localhost link.
