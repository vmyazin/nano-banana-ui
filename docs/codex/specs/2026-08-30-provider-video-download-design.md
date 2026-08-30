# Reliable provider video downloads

Status: Approved design

## Context

Provider video results are hosted on cross-origin CDNs. `downloadRemoteMedia` first fetches the bytes in the browser and saves a blob with the semantic filename. When a CDN omits CORS headers, that fetch fails. Images retry through the app's SSRF-guarded image proxy, but videos currently fall back to clicking the remote URL. Browsers ignore the `download` attribute for many cross-origin URLs, so the result opens in the current tab and keeps the provider's filename.

## Goals

- Make video downloads from every provider initiate a file download with the app's semantic filename.
- Preserve the existing fast client-side blob path when a CDN allows CORS.
- Route only the failed video path through the app origin with an attachment response.
- Stream proxied video bytes instead of buffering an entire video in server memory.
- Reuse one redirect-aware public-host check for image and video proxy routes.
- Keep signed provider URLs out of query strings and keep proxy errors out of the app tab.

## Non-goals

- Do not change provider adapters, generation, polling, result rendering, or filename composition.
- Do not persist downloaded videos on the app server.
- Do not proxy private, credential-bearing, non-HTTP, or unsupported media URLs.
- Do not replace successful browser-side downloads with server bandwidth.

## Scope and implementation boundary

The client fallback lives in `lib/media-download.ts:downloadRemoteMedia`. A failed direct video fetch submits a hidden same-origin POST form to `app/api/download-video/route.ts`; the route validates the remote URL and every redirect hop, accepts only supported video or opaque binary types, caps the response, streams it with `Content-Disposition: attachment`, and supplies the requested semantic filename.

The redirect and public-address checks shared with `app/api/fetch-image/route.ts` live in `lib/server/public-media-fetch.ts`. Provider workspaces and filename generation are outside the implementation boundary because they already call the shared downloader correctly.

## Acceptance criteria

- A CORS-failed video does not click or navigate to its provider URL.
- The fallback submits the provider URL in a POST body to a same-origin route.
- The fallback response names the file from `filenameBase` plus the verified upstream video type.
- The proxy rejects private addresses, re-checks redirect destinations, rejects non-video documents, and caps declared and streamed bytes.
- Existing image proxy and direct blob download behavior remain unchanged.

