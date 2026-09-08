# The timeline gets the console's wide column

Status: Approved design
Date: 2026-09-07

## Context

The timeline is cramped. Everything under `app/page.tsx` — image, video and
timeline alike — sits in one `max-w-7xl` (80rem) column, and the timeline is the
one workspace whose main surface grows sideways: `TimelineTrack` lays every clip
out in a row beside the export panel, so width is the resource it spends.

Two caps were in play, and the outer one bound first:

- `app/page.tsx` `<main>` — `max-w-7xl`, shared by every workspace.
- `TimelineWorkspace`'s root — `max-w-[1400px]` (87.5rem), the column all four
  generation workspaces share. Already wider than the page allowed, so it never
  had any effect.

The account console solved the same problem for the same reason:
`AccountPageShell`'s `wide` gives `/account` `max-w-[110rem]`, because "the
console puts a 300px settings rail beside a four-up grid, and at 7xl the grid
loses a card's worth of width to page margin."

## Design

Give the timeline that same `max-w-[110rem]`, and only the timeline. The
horizontal padding scale is already identical on both pages
(`px-6 sm:px-8 md:px-12 lg:px-16`), so matching the max-width is the whole of it.

The studio header widens along with the content, exactly as `AccountPageShell`
does for its own header row — otherwise, on a display wide enough for the change
to matter, the timeline's left edge would sit 15rem outside the wordmark above
it. The trade is that the header contents shift when you switch workspace; a
column that disagrees with its own header is the worse of the two.

`TimelineWorkspace`'s own cap moves to `max-w-[110rem]` to match. Left at
1400px it would quietly eat most of the new room and the change would look like
it half-worked. The other workspaces keep the 1400px column: none of them has a
surface that spends width the way the track does.

The footer stays on the studio column. Its content is a centred `max-w-3xl`
pair of cards, so its outer width is not visible either way, and the border it
draws already spans the viewport.
