# Universal prompt panel treatment

**Status:** Approved design

**Date:** 2026-08-31

## Context

Every image and video generation flow already uses `AutoExpandingPrompt`, but the surrounding Prompt section is still composed separately in `GenerationInterface`, `FalGenerationWorkspace`, `KieGenerationWorkspace`, and `ProviderVideoWorkspace`. Those sections currently use the same quiet card surface and border as adjacent setup and result panels, so the main creative input does not read as a distinct destination.

The prompt section should carry slightly more saturation than the rest of the workspace. It should also have a restrained animated border runner: one illuminated perimeter segment completes a clockwise lap in two seconds, fades in and out while it is moving, then remains absent for five seconds. Editing takes priority over ambient motion, so focus must suppress future laps without interrupting one already in progress.

## Goals

- Give every generation Prompt section one shared, slightly richer teal surface while leaving its textarea on the existing input surface.
- Apply the treatment universally across the main image generator and every video-provider workspace.
- Add one subtle cyan border segment that follows the rounded panel perimeter clockwise.
- Complete each lap in exactly two seconds, including the moving fade-in and moving fade-out, followed by a five-second fully quiet pause.
- Let a lap already in progress finish after the textarea receives focus, then suppress all repeats while that textarea remains focused.
- After the textarea loses focus, wait a fresh five seconds before starting another lap.

## Non-goals

- Changing prompt sizing, draft state, prompt-library behavior, example-prompt generation, provider requests, submission behavior, or result layout.
- Tinting generic textareas, setup cards, result panels, dialogs, or prompt-library editing surfaces.
- Adding animation to buttons, focus rings, provider selectors, or generated media.
- Introducing provider-specific colors or timing.
- Reworking the shared generation workspace columns or prompt placement.

## Scope and implementation boundary

Create `components/PromptPanel.tsx` as the sole owner of the Prompt section's visual surface, perimeter SVG, focus gate, animation lifecycle, and five-second repeat timer. It accepts the existing prompt header and `AutoExpandingPrompt` as children; it does not read or modify draft state and it does not know which provider rendered it.

The panel keeps the established 11px card radius and compact 14–16px padding. Its background uses a dedicated semantic token, `--prompt-surface`, derived from the existing teal hue at slightly greater saturation and lightness than `--background-elevated`. The current design target is `hsl(var(--tint-hue) 42% 8.8%)`. The textarea retains the global `--background-elevated` input treatment so the hierarchy comes from the section rather than double tinting both layers.

The border runner is an `aria-hidden`, pointer-events-none SVG overlay with a rounded rectangle normalized to `pathLength="100"`. A 12% dash travels clockwise around the perimeter. Its maximum treatment is a 1.15px Signal Cyan stroke at 55% opacity with a restrained 3px glow. The panel's normal full-perimeter hairline remains visible underneath.

The runner animation is a one-shot two-second CSS animation rather than a continuously repeating seven-second animation. During the first 250ms, the segment moves through the first 12.5% of the perimeter while fading from transparent to its peak opacity. It travels steadily for 1.5 seconds, then covers the final 12.5% while fading out over the last 250ms. When the animation ends, the component removes the runner and schedules the next lap after five seconds.

`PromptPanel` observes textarea focus through bubbling focus events. Focusing the textarea cancels a pending repeat timer but does not remove a currently running segment. When that segment's animation ends, no new timer is scheduled while focus remains. Blurring the textarea starts a new five-second timer; it never starts the next lap immediately. Focus on other controls inside the panel, including the example-prompt button, does not activate the textarea focus gate.

`components/GenerationInterface.tsx`, `components/FalGenerationWorkspace.tsx`, `components/KieGenerationWorkspace.tsx`, and `components/ProviderVideoWorkspace.tsx` replace only their Prompt section container with `PromptPanel`. Their existing labels, buttons, tooltips, prompt props, copy, and layout-slot placement remain unchanged. `components/AutoExpandingPrompt.tsx`, provider logic, stores, and API routes are outside the implementation boundary.

For `prefers-reduced-motion: reduce`, the animated runner is not rendered visually; the richer static panel surface and base hairline remain. The runner never conveys state or information, so removing it loses no meaning.

## Component behavior

1. On mount, the panel plays its initial two-second lap.
2. At the end of an unfocused lap, the runner disappears and a five-second timer begins.
3. When that timer expires and the textarea is not focused, a new two-second lap starts.
4. If the textarea receives focus during a lap, the lap completes and fades out normally, then no timer is scheduled.
5. If the textarea receives focus during the quiet pause, the pending timer is cancelled.
6. While the textarea remains focused, no runner starts.
7. When the textarea loses focus, a fresh five-second timer begins; a lap starts only after that full wait.
8. Unmounting the panel clears every pending timer.

## Error handling and resilience

The treatment is decorative and must never affect prompt editing. The SVG does not receive pointer events, focus, or accessibility-tree exposure. Timer cleanup prevents updates after unmount. If animation events do not fire, prompt entry and submission still function because no application state depends on the runner.

## Testing

- A focused unit test for `PromptPanel` uses fake timers and animation-end events to verify the initial lap, two-second completion boundary, five-second quiet interval, and repeat.
- A focus-during-lap test verifies the current runner completes and disappears without scheduling another lap.
- A focus-during-pause test verifies the queued repeat is cancelled.
- A blur test verifies the panel waits a complete five seconds before restarting.
- A structural integration test verifies all four generation workspaces render the shared `PromptPanel` and no longer own the prompt-section surface styling.
- Existing `AutoExpandingPrompt` tests continue to prove the textarea remains controlled, starts at two rows, grows to content, and scrolls at its cap.
- The full test suite, lint, production build, and a localhost smoke test across image and video workspaces run before sign-off.

## Acceptance criteria

- The main image generator plus Fal, Kie, Runware, Atlas, and Comet video flows show the same richer Prompt section surface.
- The textarea itself retains the existing input surface and focus ring.
- The animated segment follows the complete rounded perimeter clockwise in exactly two seconds.
- Fade-in occurs during the first 250ms of movement; fade-out occurs during the final 250ms of movement.
- The runner is fully absent for five seconds between laps.
- The highlight remains restrained: 12% perimeter length, 1.15px stroke, 55% peak opacity, and a subtle 3px glow.
- Focusing the textarea never interrupts the current lap, but no later lap begins while focus remains.
- Blurring the textarea starts a full five-second wait before the next lap.
- The animation is decorative, inaccessible to pointer and screen-reader interaction, and visually suppressed for reduced motion.
- Provider behavior, draft state, prompt sizing, prompt-library behavior, and result rendering are unchanged.
