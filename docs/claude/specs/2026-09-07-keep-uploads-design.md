# An uploaded image is kept

Status: Approved design
Date: 2026-09-07

## Context

A reference lived only in `useDraftStore`, which holds `File` handles and dies
with the tab. An image uploaded for one clip could not be reused for the next
without finding it on disk again, and the picker that offers "stored images" was
empty for anyone who had only ever uploaded — which is what made SA-06's Replace
a dead end rather than merely awkward.

Two decisions were taken before building: uploads are kept **automatically**,
and they are kept **locally always, in the cloud when signed in**. Both spend
something — the local eviction budget, and the account's 1 GB — so both were
asked rather than assumed.

## Design

One function, `keepUploadedImages`, called after the reference is already in the
draft. It writes a gallery record and, when there is an account, hands that
record to the existing `importGalleryRecord`. The local write is not incidental:
the cloud import takes a gallery record, so it is what makes the upload
importable at all.

**Where it is called from matters more than what it does.** Every reference
funnels through `prepareReferences` → `addReferences`, but only some of those
paths carry bytes from the reader's device. Picking a stored image
(`GalleryGrid.sendAsReference`), reusing a result (`lib/result-handoff.ts`),
taking a cloud asset (`lib/account/reference.ts`) and claiming a seed frame all
end at the same store method, and hooking there would store copies of things
already stored. So the five genuine upload sites are hooked instead: the four
workspaces' own `addReferences(files)` and the picker's `Upload from device`.

**Identity comes from the bytes.** `prepareReferences` re-encodes before this
sees the file, so its name and modified time were minted moments ago and differ
on every upload — a name-based id would store the same picture four times across
four clips. A SHA-256 of the content (with a four-lane fallback where
`crypto.subtle` is absent) gives `upload-<hash>`, and `defaultAccountImportId`
derives the cloud import id from that. Same picture, same id, in both libraries.

**A held copy still re-attempts the cloud.** Skipping the import when the record
exists locally would strand every image uploaded while signed out, and every one
whose first import was refused. Re-attempting costs one POST that the Worker
answers `completed` without re-sending bytes — verified: a second upload of the
same file left `upload_attempt` at 1.

**It never throws and is never awaited.** Storing runs after the reference is in
hand, so a full library or a refused import must not cost the reader the
generation they were starting. `record()` already reports storage refusal
through `storageError`, which the library surfaces.

## Non-goals

- No storing of video uploads as clips. The report and the decision were about
  images; a dropped video already becomes a still via `lastFrameAsImageFile`,
  and that still is kept.
- No toast per upload. Automatic means quiet; the cloud storage meter and the
  library are where this becomes visible.
- No Worker change. The imports API already accepts `local-test`, which is what
  `accountImportIntent` falls back to for a record with no cloud provider.

## Known wart

A kept upload shows in the cloud library as `local-test · image · 138.6 KB`.
`local-test` is the provider fallback, and it reads like a developer artifact.
Giving uploads their own provider name means adding one to the Worker's import
allow-list and deploying it, so it is left for a decision rather than folded in
here.

## Scope and implementation boundary

`lib/gallery/keep-upload.ts` (new), plus one call in each of
`GenerationInterface`, `ProviderVideoWorkspace`, `FalGenerationWorkspace`,
`KieGenerationWorkspace` and `LibraryOverlay`.

Must not modify: `lib/account/import.ts`, `lib/draft/ingest.ts`,
`store/useGalleryStore.ts`, or anything under `cloud/`.

## Acceptance

- An uploaded image appears in the browser library, titled from its filename.
- Signed in, it also appears in the cloud library and the picker's cloud tab.
- The same picture attached again stores one copy and re-sends no bytes.
- Signed out, it is kept locally and nothing is uploaded.
- A refused library or a refused import loses the copy, never the reference.
