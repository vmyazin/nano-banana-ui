# Image format conversion (PNG / JPEG / WebP)

Status: Approved design

## Context

Nano Banana — and every Gemini image path in this app — returns PNG. PNG is the
worst default this app could carry:

- **Payload.** A 2K PNG runs 4–8 MB where the same image is 300–700 KB as WebP.
  Those bytes cross the wire twice: once into `/api/fal/upload` (capped at 20 MB
  per file, `app/api/fal/upload/route.ts:11`), once back out to the vendor.
- **Compatibility.** Several providers handle PNG references poorly or reject
  them outright, while every provider in this repo's catalogs accepts JPEG and
  WebP.
- **Storage.** The library holds result bytes in IndexedDB and evicts under a
  budget (`lib/gallery/eviction.ts`). PNG-sized records mean eviction fires
  sooner and keeps less.

The app already knows how to *talk about* image formats — `SUPPORTED_RASTER_MIMES`,
`extensionForMimeType`, `sniffMediaMime` in `lib/media-download.ts`, magic-byte
validation in `app/api/fal/upload/route.ts` — but it has never been able to
*change* one.

## Goals

1. Convert between PNG, JPEG, and WebP at the three points where image bytes
   enter or leave the app: reference ingest, download, and library storage.
2. Default to a smaller, more compatible format automatically, so the payload
   problem is fixed for users who never touch a setting.
3. Give the user an explicit override, including "leave it alone".

## Non-goals

- **Resizing or downscaling.** Re-encode only; never resample. A 4K reference
  stays 4K. `lib/draft/aspect-match.ts` reads reference dimensions, and changing
  them under it is a separate decision.
- **AVIF encoding.** AVIF stays decode-only (it is already in the ingest
  allowlists). Browser AVIF *encode* support is too thin to default to, and
  offering a format that silently falls back to PNG is worse than not offering it.
- **Video.** No video transcoding, and no change to the timeline's export format
  (`components/TimelineOutputFormat.tsx`).
- **Server-side conversion.** See "Vercel constraints" below.

## Scope and implementation boundary

New files:

- `lib/image/convert.ts` — the encoder and its four safety rules.
- `lib/image/policy.ts` — the format decision, and nothing else.
- `lib/draft/ingest.ts` — `prepareReferenceFiles`, the reference-side hook.
- `components/ImageFormatControl.tsx` — the UI control.

Modified, at the named lines:

| File | Line | Change |
| --- | --- | --- |
| `store/useAppStore.ts` | ~47 | Persisted `imageFormat` + `convertLibraryImages` |
| `store/useGalleryStore.ts` | 82, 109 | Convert in `record` and `keep` |
| `components/GenerationInterface.tsx` | 321, 639 | Ingest hook; download conversion |
| `components/FalGenerationWorkspace.tsx` | 421 | Ingest hook |
| `components/KieGenerationWorkspace.tsx` | 222 | Ingest hook |
| `components/ProviderVideoWorkspace.tsx` | 310 | Ingest hook |
| `components/GalleryGrid.tsx` | 132 | Ingest hook |
| `lib/media-download.ts` | ~200 | Convert images in `downloadRemoteMedia` |

**Do not modify:**

- `store/useDraftStore.ts` — `addReferences` stays synchronous. See §3.
- `app/api/fal/upload/route.ts`, `app/api/fetch-image/route.ts` — their
  allowlists already include `image/webp`, so no server change is needed.
- `lib/timeline/**` — the timeline owns its own output format.
- `lib/gallery/record-job.ts` — files metadata only, holds no bytes.
- Any video path in `lib/media-download.ts`.

## Vercel constraints

The live app deploys to Vercel (`docs/deployment.md`). Two constraints follow,
and both shaped the design rather than being checked after it:

**Conversion is client-side, entirely.** `createImageBitmap` and
`OffscreenCanvas.convertToBlob` are platform APIs, so this adds no Vercel
Function, no dependency, and no native binary. This is not incidental: this repo
already has a server-side media feature that cannot run on Vercel —
`/api/timeline/render` is disabled in production because it assumes one
long-lived process (in-memory job registry, `os.tmpdir()`, `spawn('ffmpeg')`).
A `sharp`-based converter would land in exactly that trap. Client-side Canvas
avoids it by construction, and *reduces* serverless cost: converting before
upload means smaller bodies through `/api/fal/upload` and fewer 413s.

**No canvas access at module scope.** Next.js prerenders on the server during
`next build`, where `OffscreenCanvas` does not exist. The format-support probe
must be computed lazily inside a function on first call. A top-level
`const SUPPORTS_WEBP = probe()` would throw the build. This is the single
easiest way to break the deploy with this feature, so it is stated here rather
than left to the implementation to remember.

## 1. `lib/image/convert.ts`

`convertImageBlob(blob, format, quality)` decodes with `createImageBitmap`, draws
to an `OffscreenCanvas` (falling back to a detached `<canvas>` element), and
encodes with `convertToBlob` / `toBlob`.

Four rules make it safe to call from anywhere:

**Never grow.** If the encoded result is not smaller than the source, return the
source untouched. A flat-color PNG — a UI screenshot, a diagram — can re-encode
*larger* as WebP. Without this rule, "convert for a smaller payload" would
sometimes do the opposite, silently.

**Idempotent.** A blob already in the target format is returned as-is, with no
decode/encode cycle. This is what prevents a PNG→WebP→WebP generation-loss chain
when a library image (already converted on capture) is later added as a
reference (converted again on ingest).

**Alpha-safe.** JPEG has no alpha channel. A transparent PNG encoded as JPEG
comes back with black behind the transparent regions — a silent, ugly failure.
`convertImageBlob` samples the decoded alpha channel, and redirects a JPEG
target to WebP when the source is actually transparent. WebP carries alpha, so
the redirect costs nothing.

**No silent mislabeling.** `canvas.toBlob(cb, 'image/webp')` in a browser without
WebP encoding does not fail — it quietly hands back a PNG. `supportsImageFormat`
probes once by encoding a 1×1 canvas and reading the returned `blob.type`,
memoized lazily (never at module scope — see Vercel constraints). Every filename
extension downstream is derived from the *actual* blob type via the existing
`extensionForMimeType`, so a fallback can never produce a `.webp` file holding
PNG bytes.

## 2. `lib/image/policy.ts`

One pure function, `targetFormat({ sourceMime, destination, preference })`, where
`destination` is `'reference' | 'download' | 'library'`.

Under the default preference `'auto'`: **PNG → WebP at q0.92; JPEG, WebP and
AVIF pass through untouched.** An explicit `'png' | 'jpeg' | 'webp'` preference
forces that format for every source.

WebP is the automatic target rather than JPEG because it is alpha-safe (no
transparency trap), smaller than JPEG at equal visual quality, and already
present in every allowlist this repo enforces — `app/api/fal/upload/route.ts:14`,
`app/api/fetch-image/route.ts:10`, `lib/drop/dropped-sources.ts`. JPEG remains
reachable as an explicit choice for a provider that specifically wants it.

Keeping this pure and separate from `convert.ts` is what makes the rules
testable in jsdom, where no canvas encoder exists.

## 3. Reference ingest

`prepareReferenceFiles(files, preference)` in `lib/draft/ingest.ts` converts a
batch, and is called immediately before `addReferences` at five sites:
`GenerationInterface.tsx:321`, `FalGenerationWorkspace.tsx:421`,
`KieGenerationWorkspace.tsx:222`, `ProviderVideoWorkspace.tsx:310`,
`GalleryGrid.tsx:132`. All four workspace wrappers are already `async` and
mount-guarded, so no new plumbing is introduced.

**`useDraftStore.addReferences` stays synchronous and unmodified.** The
tempting alternative — insert the reference immediately, then swap `file`
in-place when conversion resolves, mirroring how `measureImageUrl` fills in
dimensions at `store/useDraftStore.ts:79` — has a race: a user who hits Generate
during the conversion window ships the original PNG anyway, which is precisely
the bug this feature exists to fix. Converting before insert closes it.

The cost is a short delay before the thumbnail appears. The drop zone already
renders a spinner for URL drops (`isFetching` in `lib/drop/use-file-drop.ts`),
so the affordance exists.

## 4. Download

`useAppStore` gains a persisted `imageFormat: 'auto' | 'png' | 'jpeg' | 'webp'`,
defaulting to `'auto'`.

`downloadImage()` (`components/GenerationInterface.tsx:639`) currently
short-circuits `data:` URLs straight to an anchor. That path now decodes through
the existing `blobFromDataUrl` (`lib/gallery/capture.ts:20`), converts, and
saves. The remote branch already holds a Blob before saving.
`downloadRemoteMedia` in `lib/media-download.ts` gets the same treatment, gated
on `mediaType === 'image'`; every video path is untouched.

Filenames keep coming from `downloadFilenameBase` with the extension derived
from the converted blob's real type.

## 5. Library storage

`useGalleryStore.record` (line 82) and `keep` (line 109) are the only two points
where bytes enter the library, and both are already `async`. Converting there
covers every caller — `captureImage` in `GenerationInterface.tsx`, and each
provider workspace's Keep — without touching any of them. Video posters
(`posterBlob`) convert under the same policy, since a poster becomes a reference
image through `GalleryGrid.sendAsReference`. A record's main blob converts only
when `kind === 'image'`.

**This is the one irreversible piece, and it is opt-out for that reason.** Once
the library holds WebP, the original PNG is gone; a later "download as PNG" can
only re-encode an already-lossy image. At q0.92 that is visually near-lossless,
and the never-grow rule means it only happens when it genuinely saves bytes —
but it is a one-way door. `convertLibraryImages` (persisted, default on) turns it
off for users who want their archive to hold exactly what the provider returned.

## 6. UI

One `SegmentedToggleGroup` — **Auto / PNG / JPG / WebP** — in
`components/ImageFormatControl.tsx`, following the "automatic, but editable"
precedent already set by `components/TimelineOutputFormat.tsx`. It renders the
effective outcome (`Auto → WebP`) rather than just the mode, so the automatic
behavior is visible instead of mysterious, and it hides any format the running
browser cannot encode. The library opt-out sits beside it.

## Error handling

Conversion is a best-effort optimization, never a gate. Every failure path —
`createImageBitmap` rejecting a corrupt file, a missing canvas encoder, an
unsupported format — returns the **original blob unchanged** rather than
throwing. A reference that will not convert is still a usable reference; a
download that will not convert still downloads. Nothing in this feature may turn
a working generation into a failed one.

## Testing

`lib/image/policy.ts` is pure and gets unit tests: auto-maps PNG to WebP, leaves
JPEG/WebP/AVIF alone, honors an explicit preference, and respects the
destination.

`lib/image/convert.ts` takes an injectable encoder seam — the same reasoning that
makes `lib/gallery/storage.ts` a port, since jsdom has no canvas encoder. Against
a fake encoder the tests cover the four rules: never-grow returns the source,
idempotency skips the encode entirely, a transparent source redirects JPEG to
WebP, and an encoder that answers with the wrong MIME type is treated as
unsupported rather than mislabeled.

Real encoding is verified in a browser smoke test before shipping, per the
session workflow in `AGENTS.md`: convert a PNG reference, confirm the bytes
shrink and the vendor accepts them, and download in each format.

Existing suites that touch these paths must stay green: `tests/draft/*`,
`tests/generation-interface.test.tsx`, `tests/media-download.test.ts`,
`tests/gallery/*`.
