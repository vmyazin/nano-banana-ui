# Export audio endpoint plan

Spec: `docs/codex/specs/2026-09-09-export-audio-endpoint.md`

## File map

| Target | Responsibility |
| --- | --- |
| `lib/timeline/render/audio-endpoint.ts:1-107` | Pure packet drop/clamp and settled-boundary rules |
| `lib/timeline/render/webcodecs.ts:39-794` | Audio chunk planning, encoder lifecycle, mux boundary integration |
| `tests/timeline/audio-endpoint.test.ts:1-201` | Endpoint, timestamp, chunk continuity, and adoption regression checks |
| `scripts/seed-export-audio-fixture.mjs:1-37` | Local-only synthetic media reproduction |
| `.claude/launch.json` | Named web3141/Worker8841 run configuration |
| `AGENTS.md` | Route future audio endpoint work to its canonical helper |

Do not modify: server renderer/ffmpeg arguments, provider adapters, timeline
placement and trim behavior, the dimension-label worktree, or another session's
`temp/` and `test-assets/` files.

## Steps

- [x] Reproduce using the seed script and the app UI. Record measured streams in
  `docs/codex/reviews/2026-09-09-export-audio-endpoint.md` using ffprobe.
- [x] Implement the pure endpoint helper and integrate a directly managed AAC
  encoder into `webcodecs.ts`. Verify: `pnpm exec tsc --noEmit`.
- [x] Add endpoint and chunking regressions. Verify:
  `pnpm exec vitest run tests/timeline` — 448 tests passed.
- [x] Measure fresh-page native UI exports at eight and twelve seconds with audio.
  All stream/container durations match; 192/288 frames at 24 fps. AAC decode passed.
- [x] Verify Keep audio off and cancellation in the app UI.
- [x] Complete independent Fable 5.1 review and resolve actionable findings through Opus 4.8; 21 endpoint tests passed.
- [x] Verify `pnpm build`, final TypeScript check, and `git diff --check`.
- [x] Present localhost for explicit user merge approval. User approved commit and
  merge of `codex/export-audio-endpoint` on 2026-09-09. Rebase on origin/main before shipping.
