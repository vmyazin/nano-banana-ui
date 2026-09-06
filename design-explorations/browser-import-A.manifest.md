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

---

# Variant A — decisions and parity (2026-09-05)

Reference: `browser-import-A.reference.html` · Built as `components/account/BrowserImportDialog.tsx`

## Gap decisions (resolved with the user)

| # | Gap | Decision |
| --- | --- | --- |
| 1 | Selection can exceed free space; today it fails mid-transfer as `storage_full` | **Block** — the budget bar turns amber, the import button disables, and the footer names the overage. Nothing is sent until it fits, so there is no half-imported batch or wasted upload |
| 2 | Closing the dialog mid-transfer aborts the remaining files | **Keep it open** — Close and the backdrop are disabled while busy, and stopping is an explicit "Stop importing". The copy already promises the tab stays open; the dialog now means it |
| 3 | Progress granularity | **Per-file status + overall count** — each cell shows ready/uploading/imported/error and the footer reads "N of M imported". All of it already resolves per file; byte-level progress was declined as new plumbing |
| 4 | Thumbnails (✅ real, never rendered) | **Lazy** — each cell mints its object URL when it scrolls within 200px of the viewport and revokes on unmount, so a 90-file device does not hold 90 decoded bitmaps. Falls back to a kind icon where `createObjectURL` is unavailable |

## Structural change

The import loop moved out of the panel into `lib/account/use-browser-asset-import` (`use-asset-import.ts`)
and `AccountAssetImport.tsx` was deleted. The loop carries the parts that are easy to get wrong and
were paid for once already — the stable per-file client id that makes a retry idempotent, the
terminal-failure restart, and the owner/epoch check between every file — so it was moved wholesale
rather than rewritten. `tests/account/import.test.tsx` now drives the dialog; every assertion about
payloads, retries, aborts and restarts is unchanged.

## Parity deltas found and fixed

| Delta | Resolution |
| --- | --- |
| Provider meta overflowed the cell ("fal.ai · Nano Banana 2 · …" truncated) | Use the provider id, as `CloudAssetGrid` already does in its meta line |
| Keys tab had no count | Counted from `browserKeyCandidates`, matching the files tab |

## Deliberate deviations

1. **Cells are 2/3/4 across by viewport**, where the reference draws a fixed 4. The dialog is a real
   responsive surface and the mock was a fixed-width drawing.
2. **No "Newest first" control** — it is a label, not a menu. Records already arrive newest-first and
   a second sort order was not requested.

## Verification

- Live on the local stack with 12 seeded browser records (real canvas-drawn PNGs, real providers and
  sizes): thumbnails, filters, select-all, selection rings, footer totals and the keys tab all confirmed.
- The over-quota block and the close-lock cannot be reached against a 1 GB free quota, so both are
  covered by tests instead: `blocks an import that would not fit and names the overage` and
  `refuses to close while a transfer is running`.
- `tsc` clean · eslint 0 errors · app **1583 passed** · Worker **138 passed**.
