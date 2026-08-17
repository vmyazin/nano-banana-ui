# Plan — Runware, Atlas Cloud, CometAPI as generation sources

Spec: `docs/claude/specs/2026-08-16-multi-provider-sources.md`

## File map

Create:

| Path | Contents |
| --- | --- |
| `lib/providers/types.ts` | `ProviderId`, `ProviderModel`, `ProviderTask`, adapter interface |
| `lib/providers/catalog.ts` | curated verified models per provider, with prices |
| `lib/providers/runware.ts` | task-array client: image (sync), video (async + getResponse) |
| `lib/providers/atlas.ts` | submit + `prediction/{id}` poll client for image and video |
| `lib/providers/comet.ts` | OpenAI-compatible images + multipart `/v1/videos` client |
| `lib/providers/index.ts` | id → adapter registry, shared fetch-to-base64 helper |
| `lib/providers/browser.ts` | client-side helpers: create/poll a video job |
| `app/api/providers/video/route.ts` | `operation: create \| status` for the three |
| `store/useProviderJobsStore.ts` | shared job store (mirrors `useKieJobsStore`) |
| `tests/providers/*.test.ts` | request shape, error mapping, polling, catalog |

Modify (seams only):

| Path:lines | Change |
| --- | --- |
| `lib/engines/registry.ts` | three `EngineMeta` entries + `EngineId` union |
| `app/api/generate/route.ts` | branch to the provider layer for the new ids |
| `store/useAppStore.ts` | `runwareApiKey`, `atlasApiKey`, `cometApiKey`, model prefs, video engine union |
| `components/ApiKeyConfig.tsx` | three credential cards |
| `components/GenerationInterface.tsx` | key gating, cost line, model select |
| `components/ProviderLogo.tsx` | three marks |
| `lib/engines/docs.ts` | three doc links |
| `components/VideoWorkspace.tsx`, `components/ProviderSelector.tsx` | five video providers |

Do not modify: `lib/engines/gemini.ts`, `lib/engines/pollinations.ts`,
`lib/engines/cloudflare.ts`, `lib/fal/**`, `lib/kie/**`, `lib/gallery/**`,
`lib/auth/**`, `store/useFalJobsStore.ts`, `store/useKieJobsStore.ts`,
`components/FalGenerationWorkspace.tsx`, `components/KieGenerationWorkspace.tsx`.

## Task 1 — provider layer (images)

- [ ] `lib/providers/types.ts` + `catalog.ts` with the spec's verified models.
- [ ] `runware.ts`: `generateImage` posting the task array, mapping
      `errors[0].message` to a readable failure, returning `{ url, cost }`.
- [ ] `atlas.ts`: `generateImage` submitting then polling `prediction/{id}` with
      bounded backoff; treat `failed` as an error carrying `logs`.
- [ ] `comet.ts`: `generateImage` posting the OpenAI shape, reading `b64_json`
      first and `url` second.
- [ ] `index.ts`: registry + `toBase64(url)` so every adapter can return bytes.
- Verify: `npx vitest run tests/providers`

## Task 2 — image path wired end to end

- [ ] `registry.ts` entries (Runware first among the paid engines).
- [ ] `/api/generate` branch: validate key, call adapter, return `imageData`.
- [ ] `useAppStore`: three keys + `runwareImageModel` / `atlasImageModel` /
      `cometImageModel`.
- [ ] `ApiKeyConfig`: three cards with links to each provider's key page.
- [ ] `GenerationInterface`: gate generate on the key, show the model select and
      the published price in the cost line.
- [ ] `ProviderLogo` + `lib/engines/docs.ts`.
- Verify: `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, then a browser pass
  on the engine picker with no key (gating) and the ⌘K palette.

## Task 3 — video path

- [ ] `app/api/providers/video/route.ts` — `create` returns `{ taskId }`,
      `status` returns `{ state, progress, urls, cost }`.
- [ ] `lib/providers/browser.ts` + `store/useProviderJobsStore.ts` polling with
      backoff and a cap.
- [ ] `ProviderSelector` + `VideoWorkspace`: five providers, mode filtering per
      provider capability (Runware `alibaba:wan@2.6-flash` is image-to-video only).
- [ ] Reuse `GalleryGrid` capture so finished videos land in the library.
- Verify: `npx vitest run tests/providers`, plus a browser pass on the video
  workspace provider toggle.

## Task 4 — ship

- [ ] `npx next build`
- [ ] Update `AGENTS.md` routing if a new doc is needed.
- [ ] Hand over the localhost link; do not push without sign-off.

## Follow-up decisions

- 2026-08-16: live catalog browsing (Atlas `/api/v1/models`, Comet `/api/models`)
  is deferred out of Task 2 — the curated set ships first, the endpoints are
  recorded in the spec for a later picker.
