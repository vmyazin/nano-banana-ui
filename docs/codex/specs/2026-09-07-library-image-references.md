# Library image reference MIME repair

Status: Approved design

## Follow-up decision — 2026-09-07

The initial server-only boundary is superseded for the Library metadata precheck: lib/account/reference.ts rejects generic MIME before fetching, even when the server repairs response headers. Permit only a generic-MIME record already classified as an image to reach the existing strict downloaded-image validation. This avoids N extra R2 HEAD requests on every library list and does not accept generic downloaded bytes.

## Context

Cloud Library “Use image” and completed-result “Use as reference” reject valid Runware images as non-images. Remote capture validates the response type and writes it to R2, but takes database MIME from the multipart completion result. Completion can omit HTTP metadata, leaving a generic database MIME that private downloads then send to the browser.

## Goals

- Persist the MIME validated during capture for newly generated assets.
- Existing assets with generic database MIME download with their supported stored R2 MIME, restoring both reference entry points without regenerating images.
- Keep authorization, byte ranges, reference conversion, size limits, and user/session guards intact.

## Non-goals

No provider changes, broad content sniffing, relaxed downloaded-image validation, migrations, timeline fixes, storage quota changes, deployment, or unrelated UI work.

## Scope and implementation boundary

The fix lives inside cloud/src/assets.ts captureResult and cloud/src/media.ts private media response handling, with focused cloud test fixtures and regressions. Do not modify provider adapters or reference conversion. The Library metadata precheck alone may admit kind=image with exactly application/octet-stream so its private download can resolve the legacy type; the downloaded Blob must still satisfy the existing image MIME guard before preparation or insertion. Recovery uses only a supported stored object content type when the persisted type is generic; it does not reinterpret arbitrary files as images.

## Acceptance

A remote PNG without source MIME still records image/png when multipart completion omits metadata. Both authenticated and capability download paths serve valid legacy PNG assets as image/png, including byte-range responses. Non-image/unsupported types remain rejected. Local Cloud Library and completed-result reference actions add the seeded legacy image to the draft. No paid generation is required.
