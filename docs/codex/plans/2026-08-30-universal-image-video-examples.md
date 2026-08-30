# Universal image-to-video example prompts plan

## File map

- `lib/example-prompts.ts:5-45` — define the scene-neutral image-to-video meta prompt used by both backends.
- `lib/micro-ai/tasks.ts:29-72` — select image-conditioned output rules without changing other feature tasks.
- `tests/micro-ai/tasks.test.ts:1-40` — cover the micro task contract and preserve text-to-video behavior.
- `tests/micro-ai/routes.test.ts:90-170` — prove the Gemini fallback receives the universal brief.
- `docs/codex/specs/2026-08-30-universal-image-video-examples-design.md` — acceptance source.

## Do not modify

- Prompt and workspace React components
- Provider, fal.ai, Kie, or Runware generation adapters
- Upload state or media transport
- Model catalogs and pricing

## Tasks

- [x] Update the image-to-video feature brief in `lib/example-prompts.ts`; verify with `npx vitest run tests/micro-ai/tasks.test.ts tests/micro-ai/routes.test.ts`.
- [x] Add image-to-video-specific output rules in `lib/micro-ai/tasks.ts` so the shared model is not asked for unseen content details; verify with the focused Vitest command.
- [x] Add regression coverage in `tests/micro-ai/tasks.test.ts` and `tests/micro-ai/routes.test.ts`; verify with the focused Vitest command.
- [x] Run `npm test`, `npm run lint`, and `npm run build`.
- [x] Smoke-test the affected prompt section on a non-default local port without starting a paid media generation.
- [ ] Present the localhost URL and wait for explicit sign-off before shipping.
