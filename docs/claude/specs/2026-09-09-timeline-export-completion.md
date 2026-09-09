# Timeline export needs an end state

Status: Approved design

## Context

The export panel is a five-state machine (browser can render, server can render,
neither can, rendering, clips unavailable) and exactly one shows at a time. There
is no sixth state for *finished*.

So a render ends like this: `runExport` calls `downloadBlob(blob, ...)` and then
`setRender(null)`, which drops the panel back to the "Export 20s · with audio"
button it started from. The browser's download shelf is the only evidence the
export happened — no filename in the app, no size, no confirmation, nothing to
click if the download was missed or dismissed. A review called this the single
deliverable of the whole feature ending ambiguously, and rated it critical.

The progress readout itself is fine — an earlier fix made it report real
percentages mid-encode.

## Goals

- One end state after a successful render, naming what was produced: filename
  and size, e.g. **"Exported timeline-export-1788796965595.mp4 · 14 MB"**.
- **Download** from that state, so a missed or dismissed browser download is
  recoverable without re-encoding.
- **Save to library**, so the export can be kept, re-used as a clip, or picked up
  from another surface — and so the bytes that were just computed are not thrown
  away by the only path that has them.
- The state is dismissible, returning the panel to Export.

## Non-goals

- Renaming exports. The filename stays `timeline-export-<timestamp>.mp4`; this
  change only makes it visible. A friendlier name is a separate question and
  would touch the slug pipeline.
- Auto-saving exports to the library. See the boundary below.
- Any change to progress reporting, engine selection, or the failure paths.
- A history of past exports. One end state, for the render that just finished.

## Scope and implementation boundary

Lives in `components/TimelineExportPanel.tsx`. It owns the state machine and is
the only component that ever holds the finished blob.

Saving goes through `useGalleryStore.record` — the library chokepoint AGENTS.md
names — with `kind: 'video'`, `pinned: true`, and the export's own bytes. It must
not write through a new path.

**Supersedes a rule, deliberately.** `downloadBlob`'s comment says the blob is
"never written back into the gallery — storing it would double the storage cost
of every export against a budget the pinning rules already strain." That
rationale is about storing *every* export automatically, and it stands: this
change does not auto-save. What it adds is a button, so the cost is paid only for
exports someone deliberately keeps. The comment is updated to say that, rather
than left reading as violated.

Must not touch: `lib/timeline/render/*` (engines and progress), the failure and
fallback branches, or the eviction rules in `lib/gallery/eviction.ts`.

## Acceptance

- A finished render shows filename and size, with Download and Save to library.
- Download re-downloads the same bytes without re-encoding.
- Save to library adds one pinned video record and reports when it cannot
  (the library is full — `record` returns null and sets `storageError`).
- Dismissing returns the panel to the Export button.
- Starting another export replaces the end state rather than stacking.
