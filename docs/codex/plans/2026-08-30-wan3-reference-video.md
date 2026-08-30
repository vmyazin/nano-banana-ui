# WAN 3 character-reference video implementation plan

> **Follow-up decision — 2026-08-30:** User-requested layout unification supersedes
> the earlier Kie/fal UI exclusion. Only presentation composition changes: request
> contracts, catalogs, stores, and generation behavior remain on the original plan.

> **Follow-up decision — 2026-08-30:** The Fal two-line auto-expanding prompt is
> now the canonical input for every image/video generation interface. This extends
> presentation scope to `GenerationInterface` without changing generation behavior.

**Status:** Completed — user approved the localhost smoke test

**Date:** 2026-08-30

## File map

- `lib/providers/types.ts:1-130` — semantic reference mode, mode-keyed video input capability, ranged duration metadata, internal resolved input field.
- `lib/providers/catalog.ts:1-470` — WAN 3 catalog entry and catalog resolution/validation helpers.
- `lib/providers/runware.ts:110-140` — select the trusted Runware input field.
- `lib/providers/browser.ts:29-45` — submit the semantic input mode.
- `app/api/providers/video/route.ts:26-100` — validate mode/count and resolve trusted catalog capabilities.
- `components/VideoWorkspace.tsx:1-220` — provider-aware Character references card and safe narrowing for fal/Kie.
- `components/ProviderVideoWorkspace.tsx:1-820` — reference picker copy/tokens/cap, ranged duration control, and semantic submission.
- `components/CommandPalette.tsx:1-340` — Character references command and URL mode.
- `app/page.tsx:45-80` — accept `videoMode=reference`.
- `tests/providers/reference-mode.test.tsx:1-end` — UI/routing regression coverage.
- `tests/providers/runware-reference.test.ts:1-end` — catalog, route, and payload regression coverage.
- `.claude/launch.json:1-end` — named non-default-port smoke-test configuration.
- `components/GenerationWorkspaceLayout.tsx:1-end` — shared two-column setup/prompt/results composition.
- `components/FalGenerationWorkspace.tsx:616-848` — render existing Fal sections through the shared composition.
- `components/KieGenerationWorkspace.tsx:359-625` — move Prompt above Result through the shared composition.
- `tests/providers/workspace.test.tsx:1-end` — provider prompt/result placement regression.
- `tests/kie/workspace.test.tsx:1-end` — Kie prompt/result placement regression.
- `components/AutoExpandingPrompt.tsx:1-end` — shared two-line, auto-expanding generation prompt.
- `components/GenerationInterface.tsx:879-940` — adopt the shared prompt in the main image generator.
- `tests/auto-expanding-prompt.test.tsx:1-end` — shared prompt behavior regression.

## Do not modify

- `lib/fal/**` and all fal request/variant contracts.
- Kie routes, stores, catalog data, and request behavior. The Kie workspace JSX may change only to adopt the shared layout.
- Persistent store schemas, gallery storage, timeline code, and connection configuration.
- Existing provider test files; new coverage goes in the two named test files.
- Unrelated files or uncommitted work in the main checkout.

## Tasks

- [x] Define provider capabilities and WAN 3 transport.
  - Files: `lib/providers/types.ts`, `lib/providers/catalog.ts`, `lib/providers/runware.ts`, `lib/providers/browser.ts`, `app/api/providers/video/route.ts`.
  - Verify: `npx tsc --noEmit`.
- [x] Add provider-aware reference-mode routing and UI.
  - Files: `components/VideoWorkspace.tsx`, `components/ProviderVideoWorkspace.tsx`, `components/CommandPalette.tsx`, `app/page.tsx`.
  - Verify: `npx vitest run tests/video-workspace.test.tsx tests/providers/frames-mode.test.tsx tests/providers/frames-swap.test.tsx`.
- [x] Add focused regression tests without changing existing tests.
  - Files: `tests/providers/reference-mode.test.tsx`, `tests/providers/runware-reference.test.ts`.
  - Verify: `npx vitest run tests/providers/reference-mode.test.tsx tests/providers/runware-reference.test.ts`.
- [x] Assemble and verify the complete change.
  - Files: all files in this plan.
  - Verify: `npx tsc --noEmit && npm test && npm run lint && npm run build`.
- [x] Smoke-test the Runware reference-mode path on a non-default localhost port and request explicit user sign-off before shipping.
  - Files: no product files expected.
  - Verify: open `http://localhost:3217/?workspace=video&videoMode=reference`, select Runware, inspect WAN 3 controls and reference picker, and confirm browser console has no errors.
- [x] Extract the shared video-generation layout and migrate Fal, Kie, and aggregator providers.
  - Files: `components/GenerationWorkspaceLayout.tsx`, `components/FalGenerationWorkspace.tsx`, `components/KieGenerationWorkspace.tsx`, `components/ProviderVideoWorkspace.tsx`.
  - Verify: `npx tsc --noEmit`.
- [x] Add prompt/result placement regressions for provider and Kie workspaces while retaining Fal's existing layout test.
  - Files: `tests/providers/workspace.test.tsx`, `tests/kie/workspace.test.tsx`.
  - Verify: `npx vitest run tests/providers/workspace.test.tsx tests/kie/workspace.test.tsx tests/fal/workspace.test.tsx`.
- [x] Re-run full verification and visually smoke-test the same structure across Runware, fal.ai, and Kie.ai.
  - Files: all follow-up files in this plan.
  - Verify: `npx tsc --noEmit && npm test && npm run lint && npm run build` plus browser inspection at `http://localhost:3217/?workspace=video`.
- [x] Extract Fal's prompt resizing behavior and migrate every generation form.
  - Files: `components/AutoExpandingPrompt.tsx`, `components/GenerationInterface.tsx`, `components/FalGenerationWorkspace.tsx`, `components/KieGenerationWorkspace.tsx`, `components/ProviderVideoWorkspace.tsx`.
  - Verify: `rg -n "<textarea" components --glob '*.tsx'` returns only the shared component and `npx tsc --noEmit` passes.
- [x] Cover the shared prompt directly and in image/provider/Kie consumers.
  - Files: `tests/auto-expanding-prompt.test.tsx`, `tests/generation-interface.test.tsx`, `tests/providers/workspace.test.tsx`, `tests/kie/workspace.test.tsx`.
  - Verify: `npx vitest run tests/auto-expanding-prompt.test.tsx tests/providers/workspace.test.tsx tests/kie/workspace.test.tsx tests/fal/workspace.test.tsx tests/generation-interface.test.tsx`.
