# Stacking generated images instead of replacing them

Status: Approved design

## Context

Both image result panels show exactly one result. `GenerationInterface` derives
`generatedImage` from `generateMutation.data` (line 558), so each job overwrites
the last. `KieGenerationWorkspace` keeps a real job list in `useKieJobsStore` but
renders only `[0]` of it (line 118).

Generating is iterative — you run the same prompt three or four times and compare.
Today the second run destroys the first on screen. The bytes survive in the
library (`captureImage`, `recordFinishedJob`), but comparing means opening an
overlay, which is the wrong weight for "was the last one better?".

## Goals

1. Stack results newest-first instead of replacing, in both image panels.
2. Show up to 4; anything older stays reachable in the library.
3. Give every visible result its own download and fullscreen.

## Non-goals

- **Video.** Kie's video branch keeps its single `<video>` player.
  `FalGenerationWorkspace` is video-only — every `mediaType` in it is `'video'`
  and it renders `<video>` at line 192 — so it is out of scope entirely. fal
  *image* generation lives inside `GenerationInterface` and is covered there.
- **A format control on Kie's panel.** `ImageFormatControl` stays where it is.
- **Persisting the stack across a reload.** These are blob and data URLs.
- **A "reuse as reference" action per card.** The library already offers it.

## Scope and implementation boundary

New file: `components/ResultStack.tsx`.

Modified:

| File | Line | Change |
| --- | --- | --- |
| `components/GenerationInterface.tsx` | 268, 505, 558, 655, 1131-1195 | Stack state; per-item download; render `ResultStack` |
| `components/KieGenerationWorkspace.tsx` | 118, 288, 563-596 | Stack from existing jobs; per-item download |

**Do not modify:**

- `components/FalGenerationWorkspace.tsx` — video-only.
- `components/ProviderVideoWorkspace.tsx` — video-only.
- `store/useKieJobsStore.ts` — it already holds everything the Kie stack needs.
- `lib/gallery/**` — capture is unchanged; it is what makes the 4-item cap safe.
- Kie's video branch, its status chip, progress readout, and model label.

## 1. `components/ResultStack.tsx`

One presentational component, rendered by both panels. The precedent is
`GenerationWorkspaceLayout` and `AutoExpandingPrompt`, which AGENTS.md records as
existing because provider-owned markup previously let shared UI drift between
pages. A stack duplicated across two panels would drift the same way.

```ts
interface ResultStackItem {
  id: string;
  src: string;
  mimeType?: string;
  /** Model name, shown per card where the panel tracks one. */
  label?: string;
}
```

Props: `items` (newest first), `max` (default 4), `isGenerating`, `pendingLabel`,
`emptyState`, `onDownload`, `downloadingId`.

It renders the in-progress slot above the completed cards when `isGenerating`,
then up to `max` cards, each with click-to-zoom and its own download button.

**The lightbox moves into this component.** Both panels currently hold a single
`lightboxOpen` boolean (`GenerationInterface.tsx:268`), which cannot express
*which* of four images is open. `ResultStack` holds the open item instead. This
is the one piece of state it owns; everything else comes from props.

The component caps display itself rather than trusting callers to slice, so the
two panels cannot disagree about what "up to 4" means.

## 2. `GenerationInterface`

A `useState<ResultStackItem[]>` appended in the mutation's `onSuccess` (line 505,
beside the existing `captureImage` call), newest first.

Nothing clears it explicitly: `app/page.tsx:310` mounts this component with
`key={selectedFeature.id}`, so switching feature remounts and the stack goes with
it. That is exactly the intended lifetime, and it needs no code.

`downloadImage()` closes over `generatedImage` today; it takes the item as a
parameter instead. Its abort bookkeeping (`downloadOperationRef`,
`downloadAbortRef`) is unchanged — one download at a time is still correct, since
a second click supersedes the first regardless of which card it came from.

## 3. `KieGenerationWorkspace`

No new state. Line 118 already filters the job list down to the current model,
media type and input mode, then takes `[0]`; the stack is that same list's
successful jobs, newest first.

`downloadResult()` becomes `downloadResult(item)` and stops reading `latestJob`
for the URL. It still reads `latestJob` for the status chip and progress.

**Consequence, accepted deliberately:** Kie's stack survives leaving the screen,
because its jobs already do, while `GenerationInterface`'s does not. The panels
will not have identical lifetimes. Adding parallel state to Kie purely for
symmetry would mean maintaining a second copy of a list the store already owns,
and would make Kie's own results disappear from a panel whose job list still
lists them.

## 4. Overflow

Nothing to wire. Every result is already written to the library on success —
`captureImage` in `GenerationInterface`, `recordFinishedJob` for provider jobs —
so past 4 this is a line of text pointing at the Library button already in the
header.

## Error handling

A card whose image fails to load stays in the stack rather than being dropped: a
provider URL can expire while the page is open, and silently removing a result
the user just generated reads as data loss. The download button on such a card
still works, since it re-fetches through the existing download path.

## Testing

`tests/generation-interface.test.tsx` and `tests/kie/workspace.test.tsx` both
assert single-result behavior and need updating for the stack.

New coverage:

- A second generation leaves the first on screen, newest first.
- A fifth generation drops the oldest, leaving 4.
- Each card downloads its own image, not the newest one — the regression that
  matters most, since every download path here was written against a single
  ambient result.
- The in-progress slot appears above existing results rather than replacing them.
