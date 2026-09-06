# Data manifest — browser → cloud import exploration

Companion to `browser-import.html`. Sources: `lib/gallery/storage.ts` (`GalleryRecord`),
`lib/account/import.ts` (`isImportableGalleryRecord`), `lib/account/key-import.ts`,
`lib/account/use-library.ts`, `lib/engines/registry.ts`.

**Counting basis:** unlike the cloud side, this data is *local* — IndexedDB and the persisted app
store — so the counts in the variants are the real ones read off the reporting device: **89
importable files, 107.6 MB, 7 provider keys, 4 saved connections**. Quota figures assume an account
41% into its gigabyte.

| Element | Field path | Class | Note |
| --- | --- | --- | --- |
| File count / total bytes | `records.filter(isImportableGalleryRecord)`, `.blob.size` | ✅ Real | Already computed in `AccountAssetImport`; the rail summary sums the same list |
| Selected bytes | derived | ✅ Real | `selectedBytes` exists today |
| File title | `record.slug ?? record.prompt` | ⚠️ Sometimes | `slug` is optional (LLM-derived); `recordTitle` already falls back to prompt, then `"{kind} result"` |
| Provider label | `record.provider` → `ENGINES` | ✅ Real | shown today |
| File size | `record.blob.size` | ✅ Real | guaranteed non-zero by the eligibility filter |
| Kind (image/video) | `record.kind` | ✅ Real | drives the icon today |
| **Thumbnail** (A, C, D) | `record.blob` | ✅ Real | **Not rendered anywhere in the importer today.** The bytes are in hand — `URL.createObjectURL(record.blob)` — so this is the cheapest high-value addition in the exploration. Needs object-URL revocation on unmount |
| Per-kind counts ("Images 71 / Video 18") | derived from `record.kind` | ✅ Real | local list, unpaged — always exact |
| Per-provider groups + counts (C) | derived from `record.provider` | ✅ Real | local list, unpaged |
| Created-at ordering ("Newest first") | `record.createdAt` | ✅ Real | present on every record |
| Free space / "would remain free" | `storage.limitBytes − usedBytes − reservedBytes` | ✅ Real | `/api/account/storage`, already fetched by the console |
| **"All 89 fit" verdict** (B) | derived | ✅ Real | arithmetic on the two above; no such check exists today — the importer lets you select past the quota and fails during transfer |
| Per-file status (ready/uploading/imported/error) | `statuses` | ✅ Real | exists today |
| Provider keys found / already saved | `browserKeyCandidates`, `session.connections` | ✅ Real | both panels compute this |
| "Account ID required" (Cloudflare) | derived | ✅ Real | validated in `AccountKeyImport` |
| Link-only video warning | `record.blob` absent + `sourceUrl` present | ⚠️ Sometimes | `hasLinkOnly` exists; these records are excluded from the 89 |
| **"In the cloud 24" alongside local files** (D) | assets endpoint `counts.all` | ✅ Real | shipped in the console work |
| **Per-file transfer progress** (A, D) | — | ❌ Aspirational | `importGalleryRecord` resolves per file; there is no byte-level progress. A per-file status is achievable, a progress bar is not without new plumbing |
| **Resume after closing the tab** (A) | `account_imports` + `startNewAccountImportAttempt` | ⚠️ Partial | The Worker models attempts and restarts, but the browser must re-send the bytes — a modal closing mid-transfer needs a defined behaviour that does not exist today |

## Gaps to resolve if one of these is built

1. **Thumbnails** — the single biggest change and fully backed by data. Requires object-URL lifecycle
   management for up to 89 blobs; consider decoding lazily as cells scroll into view.
2. **Quota fit check** (B's whole premise) — decide what happens when the library does *not* fit:
   import what fits and say what was skipped, or refuse and make the person choose.
3. **Transfer progress** (A, D) — per-file status is real; anything finer is new work.
4. **Closing mid-import** (A) — a dialog that owns a long transfer needs an explicit answer, since
   the copy already promises "keep this tab open".
5. **Local vs cloud distinction** (D) — the risk that a local file reads as already backed up needs
   more than a pill before this ships.
