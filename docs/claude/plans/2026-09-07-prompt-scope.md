# Plan — each side keeps its own prompt

Spec: `docs/claude/specs/2026-09-07-prompt-scope-design.md`
Date: 2026-09-07

## File map

| Path | Target | Change |
| --- | --- | --- |
| `store/useDraftStore.ts` | `40:66`, `86:112`, `165:168` | `promptScope`, `promptByScope`, `enterPromptScope`, reset |
| `components/GenerationInterface.tsx` | `214:222` | Claim `'image'` |
| `components/KieGenerationWorkspace.tsx` | `111:119` | Claim by `mediaType` |
| `components/FalGenerationWorkspace.tsx` | `278:286` | Claim `'video'` |
| `components/ProviderVideoWorkspace.tsx` | `190:198` | Claim `'video'` |
| `tests/draft/store.test.ts` | append | Scope behaviour at the store |
| `tests/draft/provider-switch.test.tsx` | `152:161` | Rewrite the superseded test, add both mirrors |

## Do not modify

- `lib/draft/ingest.ts`, `lib/draft/carry-over.ts`
- Reference handling in `useDraftStore`
- `components/PromptPanel.tsx`
- Any submission path, or `setPrompt`'s signature

## Tasks

- [x] **1. Store.** `promptScope` + `promptByScope` + `enterPromptScope`: file
      the outgoing prompt, restore the incoming one, adopt when unclaimed; both
      cleared by `reset`. Verify: `npx vitest run tests/draft/store.test.ts`
- [x] **2. Workspaces.** One mount effect each, declared **before** every other
      mount effect so the seed-frame and `initialPrompt` guards see an empty
      field. Verify: `npx tsc --noEmit`
- [x] **3. Tests.** Rewrite the superseded carry test; add its mirror, a
      same-kind case and a round trip; reset the new fields in the store
      suite's beforeEach. Verify: `npx vitest run tests/draft`
- [x] **4. Full check.** `npx vitest run && npx tsc --noEmit && npx eslint … && npx next build`
- [x] **5. Smoke test** on port 3111 / worker 8811, then hand over the link.
