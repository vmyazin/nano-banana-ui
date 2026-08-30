# Reliable provider video downloads plan

## File map

- `lib/server/public-media-fetch.ts` — shared DNS, protocol, redirect, and credential-free fetch guard.
- `app/api/fetch-image/route.ts:1-120` — consume the shared guard without changing image behavior.
- `app/api/download-video/route.ts` — validate, cap, and stream a named attachment.
- `lib/media-download.ts:200-290` — replace cross-origin video navigation with the hidden POST fallback.
- `tests/media-download.test.ts:50-140` — assert the browser fallback does not click the provider URL.
- `tests/download-video-route.test.ts` — route security, media, cap, and filename coverage.

## Do not modify

- Provider, fal.ai, Kie, or Runware generation adapters
- Result workspace markup and filename composition
- Job stores, media persistence, or generation APIs
- Image upload/drop behavior

## Tasks

- [x] Extract the existing redirect-aware public-host fetch guard and keep fetch-image behavior green.
- [x] Add the streaming named-video download route with media and size checks.
- [x] Route only failed direct video downloads through a hidden same-origin POST form.
- [x] Add focused regressions for the client fallback and server route.
- [x] Run focused tests, the full suite, lint, and production build.
- [x] Smoke-test the provider workspace and a streamed named attachment on a non-default localhost port; cover the browser handoff event in focused DOM tests.
- [ ] Present the localhost URL and wait for explicit sign-off before shipping.
