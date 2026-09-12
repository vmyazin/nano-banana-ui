# Generate below Prompt implementation

## File map (original line ranges)
- components/GenerationWorkspaceLayout.tsx:3-31 — named action slot and ordering.
- components/GenerationInterface.tsx:1301-1341 — image button, cost, notice, errors.
- components/FalGenerationWorkspace.tsx:854-871 — video action and feedback.
- components/KieGenerationWorkspace.tsx:594-612 — Kie action and feedback.
- components/ProviderVideoWorkspace.tsx:861-896 — provider action and feedback.
- tests/generation-workspace-layout.test.tsx — shared DOM order regression.
- AGENTS.md and CLAUDE.md — route to the placement contract.
- .claude/launch.json — localhost 3157 / Worker 8857.

Do not modify: provider adapters, submission handlers, stores, pricing, PromptPanel, ConnectionGate, result rendering.

## Tasks
- [x] Add the shared actions slot and move the existing action JSX in the four workspaces. Verify: pnpm exec tsc --noEmit.
- [x] Add the layout ordering regression and run existing workspace tests. Verify: pnpm exec vitest run tests/generation-workspace-layout.test.tsx tests/generation-interface.test.tsx tests/fal/workspace.test.tsx tests/kie/workspace.test.tsx tests/providers/workspace.test.tsx tests/providers/video-edit-workspace.test.tsx tests/prompt-panel-adoption.test.ts --maxWorkers=2.
- [x] Update routing and named launch entry. Verify: git diff --check.
- [x] Smoke-test desktop/mobile at localhost:3157, including gated guest and local account flows; hand off preview for shipping sign-off.

## Local setup
The parent checkout currently has a local pnpm workspace file, so install with a temporary worktree `pnpm-workspace.yaml` containing `packages: []` to prevent pnpm selecting the parent. Run `CI=true pnpm install --frozen-lockfile --prefer-offline`, then remove that temporary file. Run `CI=true pnpm --dir cloud install --frozen-lockfile`, `cp ../../../next-env.d.ts .`, and `cp cloud/.dev.vars.example cloud/.dev.vars`. There is no root `.env.local` to copy; the credential-free dev launcher supplies local service configuration. Run `ACCOUNT_WORKER_PORT=8857 DEV_FAKE_GENERATION=1 npm run dev -- --port 3157`.

## Verification notes
TypeScript and targeted ESLint passed. The seven targeted test files passed (155 tests) with two workers. An initial `pnpm test -- ...` invocation ran the full suite instead of filtering, overloaded the machine and produced timeout failures; it was stopped and replaced with the direct Vitest invocation above. Desktop image and mobile gated video layouts visually show Prompt → Generate → Result.

Signed-in image preview verified: Prompt → Generate Image → cost/background execution notice → account Result. Preview remains running for user sign-off; no paid generation was submitted. CLAUDE.md already delegates to AGENTS.md, so its routing stays synchronized without a duplicate edit.
