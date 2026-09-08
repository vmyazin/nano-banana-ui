# The prompt field says what is wrong with it

Status: Approved design
Date: 2026-09-07

## Context

Issue 04. Generate Image sits at full brightness with an empty prompt. Pressing
it produces `Please enter a prompt` about sixty pixels *below* the button, in
dim red, under the cost line and the background-generation note. The field it
describes is not marked, does not take focus, and the message stays on screen
after the engine is switched — after the state that produced it is gone.

Reproduction on `main` confirmed each part:

- `handleGenerate` sets the shared `error` state, which the panel renders in a
  block placed after the Generate button, `costLine`, and `CloudExecutionNotice`.
- The textarea carries no `id`, no `aria-invalid`, and no `aria-describedby`, so
  a screen reader hears an unrelated message and sees a valid field.
- `handleEngineSelect` clears the in-flight generation and download but not
  `error`.

One state was doing two jobs: *this request failed* and *this field is empty*.
Only the first belongs below the button.

## Design

Split the second job out. A separate `promptError` lives beside the field:

- **On the field.** `aria-invalid` when set, and a border hung off that
  attribute in `globals.css` so the visual state and the one assistive tech
  reads cannot drift apart. Any field in the app gets the same treatment for
  free.

  The colour is `--brand-accent`, not red. Nothing failed — the field is asking
  to be filled in, and the panel already uses that accent for *waiting on you*
  (the Gen Example pill, the not-connected status light). Red is kept for the
  block below the button, where a request that actually failed reports.
- **Next to the field.** The message renders directly beneath the textarea with
  `role="alert"` and an id the field names through `aria-describedby`.
- **Focus.** Validation puts the cursor in the field, so the reader lands where
  the fix is. `AutoExpandingPrompt` keeps a ref of its own for resizing, so it
  takes an optional `fieldRef` and points both at the same node rather than
  exposing `ref` and leaving two refs to fight.
- **Clear on input.** Typing is the fix, so the complaint goes with the first
  keystroke, not with the next submit.
- **Clear on engine switch**, where the panel it described is replaced.

## Scope

`Please upload at least one image` stays in the general error area. It is not
about the prompt field, it has no single field to attach to on a multi-image
feature, and the report asked for the prompt: "Error on the field, focus into
it, clear on input. Nothing else changes."

The button's brightness is left alone. Dimming it would hide the reason for the
refusal behind a disabled control, which is the failure mode this change exists
to remove.
