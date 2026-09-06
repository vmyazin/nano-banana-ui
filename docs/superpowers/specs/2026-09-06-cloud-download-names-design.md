# Cloud download filenames

Status: Approved design
Date: 2026-09-06

## Context

Guest generations name their downloads after the prompt and the model:
`neon-tiger-wan-2_7.mp4`. At submit the workspace fires a fire-and-forget
`requestPromptSlug` (`lib/micro-ai/browser.ts`) at `/api/slug`, which answers
from the app-owned Llama 8B tier, then the user's Gemini key, then a regex
slugifier. The slug is pinned to the job in its store, and
`downloadFilenameBase` (`lib/download-name.ts`) appends the model's `fileCode`.

Account (cloud) downloads skip all of that. `downloadAccountAsset`
(`lib/account/download.ts`) names every file `scene-assembly-<asset id>`, and
`CloudAssetGrid` hands `LastFrameActions` the same id-based base. The Worker
stores the job request as asset metadata, so prompt, provider and model are
already on every `CloudAsset`; only the slug is missing.

## Goals

- Cloud downloads use the same `<slug>-<model code>.<ext>` shape as guest ones,
  from the same two modules, so a file says what made it once it leaves the app.
- The slug is requested at the same moment as the guest path (job accepted),
  and lazily at download time for assets that were made elsewhere or earlier.
- No Worker change and no schema change.

## Non-goals

- Persisting the slug in asset metadata. A cross-device stable slug needs a
  request-shape change on the Worker and a hand deploy; the lazy request gives
  the same name on the same shared tier in practice.
- Reworking how cloud bytes are fetched. `downloadAccountAsset` keeps its signed
  URL fetch; only the name changes.
- Reading the browser Gemini key on the cloud path. `/api/slug` falls back to
  the regex slug without one, and cloud UI must not depend on browser keys.

## Scope and implementation boundary

- New `lib/account/asset-name.ts`: an in-memory slug cache keyed by job or asset
  id, `warmAccountSlug(jobId, prompt)` for the accepted-job moment, and
  `accountAssetFilenameBase(asset)` (async, requests when uncached) plus
  `knownAccountAssetFilenameBase(asset)` (sync, cache or deterministic) for
  props that need a string now.
- `lib/account/useCloudWorkspace.ts`: call `warmAccountSlug` after
  `submitAccountJob`, beside the prompt-library `remember`.
- `lib/account/download.ts`: name through `accountAssetFilenameBase` and
  `extensionForMedia`; drop the local extension map.
- `components/account/CloudAssetGrid.tsx` and `CloudJobPanel.tsx`: the
  `LastFrameActions` base comes from `knownAccountAssetFilenameBase`.
- Must not touch: `lib/download-name.ts`, `lib/media-download.ts`,
  `app/api/slug/route.ts`, anything under `cloud/`.
