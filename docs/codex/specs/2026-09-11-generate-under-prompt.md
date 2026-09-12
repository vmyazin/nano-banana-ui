# Generate below Prompt

Status: Approved design

## Context
Generate currently sits under setup, away from the prompt that users finish editing before submission. The user approved moving it below the prompt consistently across image and video workspaces.

## Goals
- Order setup → prompt → Generate and its cost/progress/retry feedback → results on mobile, with setup on the left and the remaining sequence on the right on desktop.
- Preserve button handlers, disabled states, account notices, validation, and retries.

## Non-goals
No changes to provider requests, pricing, persistence, authentication, job polling, or result rendering.

## Scope and implementation boundary
`components/GenerationWorkspaceLayout.tsx` owns a required `actions` slot immediately after `prompt`. `GenerationInterface`, `FalGenerationWorkspace`, `KieGenerationWorkspace`, and `ProviderVideoWorkspace` move their existing submit and submission-feedback JSX from `setup` into this slot. PromptPanel and provider submission functions remain unchanged. All image modes and video modes, including video edits, inherit the layout.

## Acceptance
Each workspace has one Generate action after Prompt and before results in DOM and visual order. Cost, loading labels, account execution notices and submission errors remain with the button. Connection gates and prompt validation still work. Existing workspace tests and a desktop/mobile local browser smoke test pass.
