# Each side keeps its own prompt

Status: Approved design
Date: 2026-09-07

## Context

Issue 08: moving to the Video tab carried the reference image over as the first
frame — useful — but also carried the *image-editing* prompt ("Keep the exact
same attic, the same camera angle…") into the video prompt field. A still-image
instruction sitting in a motion field silently degrades the clip.

`useDraftStore.prompt` is one session-wide string that all four workspaces bind
to. `references` is shared the same way, and there the sharing is the point: a
reference image becoming a first frame is exactly what the user wants.

The carried prompt was also masking a second effect. The seed-frame claim in
each video workspace sets its own prompt only `if (!draft.prompt)`, so a carried
image prompt *suppressed* the app's own "Continue the scene from …". Handing the
video side its own (empty) field lets that through again.

## Goals

- A prompt written for stills does not appear in a motion field, or vice versa.
- Neither prompt is destroyed: a round trip to the video page and back returns
  the image prompt intact, and the same in reverse.
- References still cross the boundary untouched.
- Switching engine, input mode or feature — none of which cross the boundary —
  never costs the user what they typed.

## Non-goals

- **No "reuse previous prompt?" affordance.** The report offered one, but
  remembering each side separately removes the need: nothing is lost, so there
  is nothing to offer back. The field a user returns to holds what they left in
  it, which needs no prompting and no extra UI.
- No change to `setPrompt`'s signature, so the ten existing call sites — the
  prompt library, gallery restore, example generation — stay as they are.
- No persistence. The draft store is session-local by design.

## Design

The store learns which kind of workspace owns the field, and keeps what the
other side was left holding:

```ts
promptScope: 'image' | 'video' | null
promptByScope: Partial<Record<PromptScope, string>>
enterPromptScope(scope)  // file the outgoing prompt, restore this scope's own
```

Crossing the boundary files the current prompt under the scope that wrote it and
loads whatever the incoming scope last had. So the two sides behave like two
fields that never bleed into each other, rather than one field that gets wiped.

A scope of `null` — nothing has claimed the field yet — adopts whatever is
already there instead of filing it. "Restore settings" and the prompt library
both write while the picker is open, and filing that under a scope that never
existed would hand the workspace it was meant for an empty field.

Each workspace claims its scope in a mount effect: `GenerationInterface` and
`KieGenerationWorkspace` (image) claim `'image'`, the three video workspaces
claim `'video'`, and Kie — which serves both — follows its `mediaType`.

Scope rather than tagging each `setPrompt` call: the writer of a prompt is
whichever workspace is on screen, so tracking that once at the boundary leaves
every existing write untouched. A same-scope claim returns `{}`, so React's
state identity is unchanged and no workspace re-renders for a no-op.

**Effect ordering matters.** The scope effect is declared ahead of every other
mount effect in each workspace, so a stale prompt cannot outlive it and block
what those effects set — specifically the seed-frame prompt and Kie's
`initialPrompt`, both of which are guarded on the field being empty.

## Scope and implementation boundary

Lives in `store/useDraftStore.ts` and the four workspace components, one mount
effect each.

Must not modify: `lib/draft/ingest.ts`, `lib/draft/carry-over.ts`, the reference
handling in the store, `components/PromptPanel.tsx`, or any submission path.

## Acceptance

- An image prompt does not appear after switching to a video workspace, and the
  reverse.
- Returning to a side restores the prompt last left there.
- An uploaded reference survives the same switch with its preview intact.
- A prompt survives a switch that stays within one kind.
- "Continue from last frame" sets its own prompt again.

## Note on a superseded test

`tests/draft/provider-switch.test.tsx` asserted "carries the prompt from the
image studio into a video workspace" — the behaviour this removes. It is
rewritten to the new contract rather than deleted, and joined by its mirror, a
same-kind case, and a round trip, so the boundary is pinned from both sides.

The store's own `beforeEach` reset predated these fields and did not clear them,
which let one test's scope leak into the next. It resets them now.
