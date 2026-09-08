# A square default, and a switch that says what it costs

Status: Approved design
Date: 2026-09-07

## Context

Issue 10, two unrelated hesitations for a new user.

**The aspect ratio default.** Text-to-image — the most general mode in the app —
opened on `16:9 (YouTube Thumbnail)`. A niche shape as the default for
"describe anything", and the app already has a Viral Thumbnail Generator whose
whole job is that shape. The value came from a `'16:9'` literal repeated at five
places in `GenerationInterface`: the draft fallback that seeds the control, the
mirror back into the draft, the gallery record, and two cloud-submit branches.

**The run-location switch.** Under the Generate button, `CloudExecutionNotice`
offers `Switch to in-browser` (or `Switch to background`) as a bare link. The
line beside it describes the mode you are *in* — "Runs in the background · saves
to your account" — and nothing describes the one you would be moving to. So the
switch asks for a decision about speed, cost, privacy and whether the result
still reaches your account with none of that on screen.

## Design

**Default to 1:1.** One `DEFAULT_ASPECT_RATIO` constant replaces all five
literals, so the default cannot drift between the control and what gets
submitted. Square over 3:2 because it is the neutral choice — no orientation
implied for a prompt that did not ask for one — and because the option list
already leads with it.

Nothing about a *chosen* shape changes: it is remembered on the draft and
survives a round trip through the video workspaces, and an attached reference
still overrides it through `useAutoAspect`. Only the untouched case moves.

**One line of consequence.** The notice keeps its status line and gains a second
line naming what the switch costs and buys, phrased for the destination:

- Leaving the background: *In-browser: closing the tab stops the run, and the
  result stays in this browser instead of your account.*
- Leaving the browser: *Background: runs on your saved connection without this
  tab open, and the result saves to your account.*

Both are facts the code already enforces — an in-browser run dies with the page
and lands only in the browser gallery until it is imported; a background run
needs a saved connection and writes to the account library. Neither claims
anything about speed or price, which vary by provider and are already reported
by the cost line directly above.

The line is always shown rather than hidden behind a hover or a tooltip: the
question it answers arrives at the moment the switch is read, and the notice
sits in the quietest type on the panel, where a second line costs nothing.
