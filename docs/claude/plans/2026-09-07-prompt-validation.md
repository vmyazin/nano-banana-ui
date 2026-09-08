# Plan — Prompt validation on the field

Spec: `docs/claude/specs/2026-09-07-prompt-validation-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `app/globals.css` | `aria-invalid` border and focus ring, in `--brand-accent` |
| `components/AutoExpandingPrompt.tsx` | Optional `fieldRef`, merged with the resize ref |
| `components/GenerationInterface.tsx` | `promptError` + `promptRef`, field wiring, clears |
| `tests/generation-interface.test.tsx` | Mark, focus, placement; clear on input; clear on engine switch |
| `tests/auto-expanding-prompt.test.tsx` | `fieldRef` focuses and resizing survives |

## Do not modify

- The `error` state and the block below the button — submission failures stay there
- `Please upload at least one image`
- The Generate button's enabled state

## Tasks

- [x] **1. Reproduce.** Message renders after the button, the cost line and the
      cloud notice; field unmarked, unfocused; survives an engine switch.
- [x] **2. `aria-invalid` styling** in `globals.css`, after the `:focus` rules so
      the accent ring wins.
- [x] **3. `fieldRef`** on `AutoExpandingPrompt`, set alongside the internal ref.
- [x] **4. `promptError`** in the workspace: set + focus on validation, cleared on
      input and on engine change; `aria-invalid` / `aria-describedby` / `role="alert"`.
- [x] **5. Tests** — three in the workspace, one on the prompt component. All four
      fail against `HEAD` and pass after.
- [x] **6. Full check.** vitest 1818, tsc, eslint, next build — all exit 0.
- [x] **7. Smoke test** on port 3131: empty submit marks and focuses the field with
      the message under it; typing clears it; switching to fal.ai clears it.
- [x] **8. Recolour** from red to `--brand-accent` on review — an unfilled field
      is not a failure. Re-smoke-tested.
