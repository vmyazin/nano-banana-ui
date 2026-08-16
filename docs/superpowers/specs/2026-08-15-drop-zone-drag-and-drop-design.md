# Drop-zone drag and drop — design

Status: Approved design
Date: 2026-08-15

## Context

Every image-source picker in the app is click-to-browse only. Three drop zones exist,
all of them rendered as a dashed-border button that opens a hidden `<input type=file>`:

| Zone | File | Accepts |
| --- | --- | --- |
| Image editing / features | `components/GenerationInterface.tsx` | images, `feature.maxImages` |
| Kie workspace | `components/KieGenerationWorkspace.tsx` | images + video (last frame), `variant.maxInputImages` |
| fal workspace | `components/FalGenerationWorkspace.tsx` | PNG/JPEG/WebP/AVIF + video (last frame), `variant.maxInputImages` |

The dashed border reads as a drop target, so people try to drop on it; nothing happens.
Two of the three zones already accept a clipboard paste, which proves the underlying
"take a File, add a reference" path is the same everywhere — only the event source differs.

## Goals

- Dropping a file from Finder/Explorer onto any of the three zones adds it as a source,
  going through the exact same validation and `useDraftStore` path as the file picker.
- Dropping an image dragged out of another browser tab or app — which hands over a URL,
  not bytes — also works. The bytes are fetched server-side, because the browser will not
  let a page read cross-origin image bytes directly.
- One visible drag state, one set of rejection messages, shared across all three zones.
- The fetch path cannot be turned into a server-side request forgery primitive.

## Non-goals

- Dragging thumbnails out of the in-app gallery into a drop zone (a separate feature —
  it needs draggable state on `GalleryGrid`).
- Whole-window drop. Only the zones themselves are drop targets; the ask is the drop zone.
- Reordering existing references by dragging them.
- Adding paste support to the fal workspace, which is the one zone that lacks it. Noted
  as a follow-up, not built here.

## Design

### 1. `lib/drop/dropped-sources.ts` — read a DataTransfer

One client-side entry point, `filesFromDataTransfer(dataTransfer, options)`, returning
`{ files, error }`. Resolution order, first match wins:

1. `dataTransfer.files` is non-empty → local drag, return those Files. No network.
2. Otherwise read `text/uri-list`, then `text/html` (an image dragged from a page arrives
   as `<img src="…">`), then `text/plain`. The first `http(s)` URL found is POSTed to the
   proxy below, and the response blob is wrapped into a `File` named from the URL path.

Rationale for the order: a local file drag also carries a `text/plain` payload on some
platforms, so checking `files` first avoids a pointless network round trip.

### 2. `app/api/fetch-image/route.ts` — the URL → bytes proxy

`POST { url }`. The route is the only new attack surface, so it is deliberately narrow:

- Protocol allowlist: `http:`/`https:` only. Blocks `file:`, `data:`, `gopher:`.
- Every hop is DNS-resolved and every resolved address is checked against the private
  and link-local ranges (loopback, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
  CGNAT `100.64/10`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped IPv6). This is why
  redirects are followed **manually**, up to 3 hops — `fetch`'s automatic redirect
  following would let hop 2 land on `169.254.169.254` without a second check.
- Response `Content-Type` must be one of PNG/JPEG/WebP/AVIF/GIF.
- Two size limits: a `Content-Length` pre-check and a streaming byte counter, because
  `Content-Length` is attacker-controlled and may be absent or a lie.
- The response body is re-served with a fixed `Content-Type` and
  `Content-Disposition: attachment`, so nothing is ever rendered as HTML from our origin.
- No credentials are forwarded and no request headers are echoed back.

Residual risk, accepted and commented at the call site: DNS rebinding between the
validating lookup and the fetch. Closing it fully means connecting to the validated IP
and overriding the `Host` header, which breaks TLS SNI for https. Given this proxy
returns only image bytes under a fixed content type and forwards no credentials, the
payoff for an attacker is a blind request, not a readable one.

### 3. `lib/drop/use-file-drop.ts` — the hook

`useFileDrop({ onFiles, onError, disabled })` returns `{ isDragging, dropProps, isFetching }`.
It owns the drag counter (dragenter/dragleave fire per child element, so a naive boolean
flickers), calls `filesFromDataTransfer`, and hands the resulting Files to the caller's
existing `addReferences` / `addImageFiles`. The hook never touches the draft store itself —
each zone keeps its own limits, MIME rules and error copy, which already differ.

### 4. Zone wiring

Each zone spreads `dropProps` onto its existing picker button and adds a highlight class
when `isDragging`. No zone changes its accept rules, its max-images maths, or its store
writes.

## Scope and implementation boundary

Lives inside: `lib/drop/*` (new), `app/api/fetch-image/route.ts` (new), and the picker
button block of the three workspace components — `GenerationInterface.tsx` (the
`feature.requiresImage` block), `KieGenerationWorkspace.tsx` and
`FalGenerationWorkspace.tsx` (the reference-image `<section>`).

Must not touch: `store/useDraftStore.ts`, the fal/Kie upload and queue routes, the
catalogs, `lib/video-frame.ts`, or any job/polling code.

## Acceptance

- A dropped PNG appears as a reference in all three zones.
- A dropped image URL from another tab appears as a reference.
- A dropped `.txt`, an oversized image, and an over-limit count each produce the zone's
  existing error copy, not a silent no-op.
- The proxy rejects `http://localhost/…`, `http://169.254.169.254/…`, a redirect that
  lands on a private address, a `text/html` response, and an over-cap body.
