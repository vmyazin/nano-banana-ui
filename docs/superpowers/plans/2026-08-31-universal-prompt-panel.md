# Universal Prompt Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generation Prompt section one shared saturated teal surface and a restrained, focus-aware clockwise border runner.

**Architecture:** Add a provider-neutral `PromptPanel` wrapper that owns only presentation, one-shot animation state, textarea-focus gating, and the five-second repeat timer. Keep `AutoExpandingPrompt` responsible for textarea sizing, and replace the four provider-owned Prompt section containers without changing their children or provider logic.

**Tech Stack:** React 19, TypeScript, Next.js 16 App Router, Tailwind CSS 4 plus global CSS, Vitest 4, Testing Library, fake timers, SVG.

**Approved spec:** `docs/superpowers/specs/2026-08-31-universal-prompt-panel-design.md`

**Commit policy:** Do not commit unless the user explicitly asks. The repository instruction overrides the generic skill's frequent-commit steps.

---

## File map

- Create `components/PromptPanel.tsx`: shared semantic Prompt section, SVG runner, focus gate, animation lifecycle, and repeat timer.
- Create `tests/prompt-panel.test.tsx`: behavioral timer, focus, blur, and cleanup tests for the shared component.
- Create `tests/prompt-panel-styles.test.ts`: executable CSS contract for the token, runner geometry, timing, toned-down highlight, and reduced-motion suppression.
- Create `tests/prompt-panel-adoption.test.ts`: structural composition contract proving every generation workspace uses `PromptPanel` exactly once.
- Modify `app/globals.css:4-70,379-410`: add the prompt surface token, panel styles, SVG runner styles, two-second keyframes, and reduced-motion rule.
- Modify `components/GenerationInterface.tsx:940-1015`: import `PromptPanel` and replace only the main image Prompt section container.
- Modify `components/FalGenerationWorkspace.tsx:788-816`: import `PromptPanel` and replace only the Fal Prompt section container.
- Modify `components/KieGenerationWorkspace.tsx:543-569`: import `PromptPanel` and replace only the Kie Prompt section container.
- Modify `components/ProviderVideoWorkspace.tsx:786-812`: import `PromptPanel` and replace only the Runware/Atlas/Comet Prompt section container.
- Modify `AGENTS.md:17-25`: route future generation prompt-section work through `PromptPanel` and explain why the wrapper must stay universal.
- Modify `DESIGN.md:150-205`: document Prompt Panel as a signature component and its indicator-light/focus rules.
- Modify `.impeccable/design.json`: add the real Prompt Panel snippet to the live design-system sidecar.
- Modify `.claude/launch.json`: add a named non-default-port smoke-test configuration on port 3221.

## Do not modify

- `components/AutoExpandingPrompt.tsx`: sizing, control, row count, and scroll cap are already shared and outside this change.
- `components/GenerationWorkspaceLayout.tsx`: prompt placement and column order are already canonical.
- `store/useDraftStore.ts` or any other store: animation and focus are local presentation state.
- `lib/providers/**`, `lib/fal/**`, `lib/kie/**`, or `app/api/**`: provider requests and submission behavior are unchanged.
- Prompt-library editing surfaces, generic `textarea` rules, result panels, model controls, or dialog components.

### Task 1: Build the focus-aware animation lifecycle with TDD

**Files:**

- Create: `tests/prompt-panel.test.tsx`
- Create: `components/PromptPanel.tsx`

- [ ] **Step 1: Write the failing behavior tests**

Create `tests/prompt-panel.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PromptPanel from '@/components/PromptPanel';

function renderPanel() {
  return render(
    <PromptPanel>
      <label htmlFor="prompt-panel-test">Prompt</label>
      <button type="button">Gen Example</button>
      <textarea id="prompt-panel-test" />
    </PromptPanel>
  );
}

describe('PromptPanel', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('plays once, stays quiet for five seconds, then repeats', () => {
    renderPanel();
    const runner = screen.getByTestId('prompt-panel-runner');

    fireEvent.animationEnd(runner);
    expect(screen.queryByTestId('prompt-panel-runner')).toBeNull();

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.queryByTestId('prompt-panel-runner')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('prompt-panel-runner')).toBeInTheDocument();
  });

  it('finishes the current lap but suppresses repeats while the textarea is focused', () => {
    renderPanel();
    const prompt = screen.getByLabelText('Prompt');
    const runner = screen.getByTestId('prompt-panel-runner');

    fireEvent.focus(prompt);
    expect(runner).toBeInTheDocument();
    fireEvent.animationEnd(runner);

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByTestId('prompt-panel-runner')).toBeNull();
  });

  it('cancels a queued repeat when the textarea receives focus during the pause', () => {
    renderPanel();
    fireEvent.animationEnd(screen.getByTestId('prompt-panel-runner'));

    fireEvent.focus(screen.getByLabelText('Prompt'));
    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.queryByTestId('prompt-panel-runner')).toBeNull();
  });

  it('waits a fresh five seconds after textarea blur', () => {
    renderPanel();
    const prompt = screen.getByLabelText('Prompt');
    fireEvent.focus(prompt);
    fireEvent.animationEnd(screen.getByTestId('prompt-panel-runner'));
    fireEvent.blur(prompt);

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.queryByTestId('prompt-panel-runner')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('prompt-panel-runner')).toBeInTheDocument();
  });

  it('does not gate repeats when a non-textarea control receives focus', () => {
    renderPanel();
    fireEvent.animationEnd(screen.getByTestId('prompt-panel-runner'));
    fireEvent.focus(screen.getByRole('button', { name: 'Gen Example' }));

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId('prompt-panel-runner')).toBeInTheDocument();
  });

  it('clears the queued repeat when unmounted', () => {
    const view = renderPanel();
    fireEvent.animationEnd(screen.getByTestId('prompt-panel-runner'));
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm the red state**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/prompt-panel.test.tsx
```

Expected: FAIL because `@/components/PromptPanel` does not exist.

- [ ] **Step 3: Implement the minimal shared component**

Create `components/PromptPanel.tsx`:

```tsx
'use client';

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

const REPEAT_DELAY_MS = 5_000;

interface PromptPanelProps {
  children: ReactNode;
  className?: string;
}

function isTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement;
}

export default function PromptPanel({ children, className = '' }: PromptPanelProps) {
  const [runnerVisible, setRunnerVisible] = useState(true);
  const textareaFocusedRef = useRef(false);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRepeatTimer = () => {
    if (repeatTimerRef.current === null) return;
    clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = null;
  };

  const scheduleRepeat = () => {
    clearRepeatTimer();
    repeatTimerRef.current = setTimeout(() => {
      repeatTimerRef.current = null;
      if (!textareaFocusedRef.current) setRunnerVisible(true);
    }, REPEAT_DELAY_MS);
  };

  useEffect(() => () => {
    if (repeatTimerRef.current !== null) clearTimeout(repeatTimerRef.current);
  }, []);

  const handleAnimationEnd = () => {
    setRunnerVisible(false);
    if (!textareaFocusedRef.current) scheduleRepeat();
  };

  const handleFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (!isTextarea(event.target)) return;
    textareaFocusedRef.current = true;
    clearRepeatTimer();
  };

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (!isTextarea(event.target)) return;
    textareaFocusedRef.current = false;
    if (!runnerVisible) scheduleRepeat();
  };

  return (
    <section
      data-testid="prompt-panel"
      className={`prompt-panel relative p-3.5 md:p-4 ${className}`.trim()}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {runnerVisible && (
        <svg
          aria-hidden="true"
          focusable="false"
          className="prompt-panel-border-runner"
        >
          <rect
            data-testid="prompt-panel-runner"
            className="prompt-panel-border-runner-track"
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="11"
            pathLength="100"
            vectorEffect="non-scaling-stroke"
            onAnimationEnd={handleAnimationEnd}
          />
        </svg>
      )}
      <div className="relative z-[1] space-y-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run the focused test and confirm green**

Run the same Vitest command from Step 2.

Expected: 1 file passed, 6 tests passed.

- [ ] **Step 5: Review checkpoint**

Inspect `git diff -- components/PromptPanel.tsx tests/prompt-panel.test.tsx`. Do not commit; confirm the component has no provider/store imports and all timer state remains local.

### Task 2: Add the saturated surface and toned-down runner styles with TDD

**Files:**

- Create: `tests/prompt-panel-styles.test.ts`
- Modify: `app/globals.css:4-70,379-410`

- [ ] **Step 1: Write the failing CSS contract test**

Create `tests/prompt-panel-styles.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${process.cwd()}/app/globals.css`, 'utf8');

describe('prompt panel visual contract', () => {
  it('defines a richer shared prompt surface without changing textarea tokens', () => {
    expect(css).toContain('--prompt-surface: hsl(var(--tint-hue) 42% 8.8%);');
    expect(css).toMatch(/\.prompt-panel\s*\{[^}]*background:\s*var\(--prompt-surface\)/s);
    expect(css).toMatch(/textarea,\s*select\s*\{[^}]*background:\s*var\(--background-elevated\)/s);
  });

  it('keeps the runner subtle and completes one lap in two seconds', () => {
    expect(css).toMatch(/\.prompt-panel-border-runner-track\s*\{[^}]*stroke-width:\s*1\.15/s);
    expect(css).toMatch(/stroke-dasharray:\s*12 88/);
    expect(css).toMatch(/animation:\s*prompt-panel-lap 2s linear 1/);
    expect(css).toMatch(/12\.5%\s*\{[^}]*stroke-dashoffset:\s*-12\.5[^}]*opacity:\s*0\.55/s);
    expect(css).toMatch(/87\.5%\s*\{[^}]*stroke-dashoffset:\s*-87\.5[^}]*opacity:\s*0\.55/s);
  });

  it('removes the decorative runner for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.prompt-panel-border-runner\s*\{[^}]*display:\s*none/s);
  });
});
```

- [ ] **Step 2: Run the style contract and confirm red**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/prompt-panel-styles.test.ts
```

Expected: FAIL because `--prompt-surface` and the Prompt Panel rules are absent.

- [ ] **Step 3: Add the semantic token and complete CSS**

Add beside `--background-elevated` in `:root`:

```css
  /* Prompt is the creative destination, so its shared wrapper carries a little
     more of the existing teal hue than setup and result panels. The textarea
     stays on --background-elevated so the section, not both layers, leads. */
  --prompt-surface: hsl(var(--tint-hue) 42% 8.8%);
```

Add before the generic Animations section:

```css
/* Shared Prompt section. The base hairline is always present; the SVG runner
   is decorative and pointer-transparent, so prompt editing never depends on it. */
.prompt-panel {
  background: var(--prompt-surface);
  border: 1px solid hsl(var(--tint) / 0.11);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
}

.prompt-panel-border-runner {
  position: absolute;
  inset: -1px;
  width: calc(100% + 2px);
  height: calc(100% + 2px);
  overflow: visible;
  pointer-events: none;
  filter: drop-shadow(0 0 3px rgba(0, 255, 249, 0.2));
}

.prompt-panel-border-runner-track {
  fill: none;
  stroke: var(--neon-cyan);
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-dasharray: 12 88;
  animation: prompt-panel-lap 2s linear 1;
}

@keyframes prompt-panel-lap {
  0% { stroke-dashoffset: 0; opacity: 0; }
  12.5% { stroke-dashoffset: -12.5; opacity: 0.55; }
  87.5% { stroke-dashoffset: -87.5; opacity: 0.55; }
  100% { stroke-dashoffset: -100; opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .prompt-panel-border-runner {
    display: none;
  }
}
```

- [ ] **Step 4: Run the focused style test and confirm green**

Run the same Vitest command from Step 2.

Expected: 1 file passed, 3 tests passed.

- [ ] **Step 5: Run the component and style tests together**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/prompt-panel.test.tsx tests/prompt-panel-styles.test.ts
```

Expected: 2 files passed, 9 tests passed.

### Task 3: Adopt PromptPanel in every generation workspace with TDD

**Files:**

- Create: `tests/prompt-panel-adoption.test.ts`
- Modify: `components/GenerationInterface.tsx:940-1015`
- Modify: `components/FalGenerationWorkspace.tsx:788-816`
- Modify: `components/KieGenerationWorkspace.tsx:543-569`
- Modify: `components/ProviderVideoWorkspace.tsx:786-812`

- [ ] **Step 1: Write the failing adoption contract**

Create `tests/prompt-panel-adoption.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceFiles = [
  'components/GenerationInterface.tsx',
  'components/FalGenerationWorkspace.tsx',
  'components/KieGenerationWorkspace.tsx',
  'components/ProviderVideoWorkspace.tsx',
] as const;

describe('universal PromptPanel adoption', () => {
  for (const file of workspaceFiles) {
    it(`${file} renders the shared prompt wrapper exactly once`, () => {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      expect(source).toContain("import PromptPanel from '@/components/PromptPanel';");
      expect(source.match(/<PromptPanel(?:\s|>)/g)).toHaveLength(1);
      expect(source.match(/<\/PromptPanel>/g)).toHaveLength(1);
    });
  }
});
```

- [ ] **Step 2: Run the adoption contract and confirm red**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/prompt-panel-adoption.test.ts
```

Expected: 4 failed tests because none of the workspace files imports or renders `PromptPanel` yet.

- [ ] **Step 3: Replace only the four Prompt section containers**

In each workspace, add:

```tsx
import PromptPanel from '@/components/PromptPanel';
```

For `FalGenerationWorkspace.tsx`, `KieGenerationWorkspace.tsx`, and `ProviderVideoWorkspace.tsx`, replace:

```tsx
<section className="glass-card space-y-3 p-3.5 md:p-4">
  {/* Keep the existing prompt header and AutoExpandingPrompt unchanged. */}
</section>
```

with:

```tsx
<PromptPanel>
  {/* Keep the existing prompt header and AutoExpandingPrompt unchanged. */}
</PromptPanel>
```

In `GenerationInterface.tsx`, replace only the outer Prompt card element with `PromptPanel`; preserve the existing Prompt label, Gen Example button, tooltip, `AutoExpandingPrompt`, social-thumbnail guidance, and their order:

```tsx
<PromptPanel>
  {/* Existing image-workspace prompt header, prompt input, and conditional tip. */}
</PromptPanel>
```

Do not add `glass-card` to `PromptPanel`; its richer surface and static hairline are owned by `.prompt-panel`.

- [ ] **Step 4: Run the adoption contract and focused behavior tests**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/prompt-panel-adoption.test.ts tests/prompt-panel.test.tsx tests/prompt-panel-styles.test.ts tests/auto-expanding-prompt.test.tsx
```

Expected: 4 files passed, 14 tests passed.

- [ ] **Step 5: Run affected workspace regression tests**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/generation-interface.test.tsx tests/fal/workspace.test.tsx tests/kie/workspace.test.tsx tests/providers/workspace.test.tsx tests/draft/provider-switch.test.tsx
```

Expected: all five files pass with no changed provider, draft, submission, or result assertions.

- [ ] **Step 6: Review checkpoint**

Run `git diff -- components/GenerationInterface.tsx components/FalGenerationWorkspace.tsx components/KieGenerationWorkspace.tsx components/ProviderVideoWorkspace.tsx` and verify that each diff contains only one import plus the Prompt wrapper replacement.

### Task 4: Document the reusable pattern and smoke-test configuration

**Files:**

- Modify: `AGENTS.md:17-25`
- Modify: `DESIGN.md:150-205`
- Modify: `.impeccable/design.json`
- Modify: `.claude/launch.json`

- [ ] **Step 1: Add the auto-load route to AGENTS.md**

Immediately after the existing `AutoExpandingPrompt` route, add:

```markdown
- **Image/video generation prompt section** → wrap the existing prompt header and
  `components/AutoExpandingPrompt.tsx` in `components/PromptPanel.tsx`. The wrapper
  owns the richer surface, decorative perimeter runner, and textarea-focus pause;
  provider pages must not recreate that timer or animation because repeated local
  implementations drift in timing, focus behavior, and reduced-motion handling.
```

- [ ] **Step 2: Extend the design-system documentation**

Under `## Components` in `DESIGN.md`, add:

```markdown
### Prompt Panel

The Prompt section is the illuminated work surface: a slightly richer teal wrapper
around the normal raised textarea. A short Signal Cyan perimeter segment makes one
two-second clockwise lap, fading during its first and last 250ms, then disappears
for five seconds. Textarea focus lets the current lap finish, suppresses repeats,
and starts a fresh five-second wait on blur.

**The Editing-Is-Quiet Rule.** Ambient prompt motion never restarts while the
textarea is focused. The current lap may finish because interrupting it reads as a
broken state rather than a calm handoff.
```

Add the Prompt surface color under the frontmatter's `colors` map:

```yaml
  prompt-surface: "#0d1d20"
```

Add the Prompt Panel token under the frontmatter's `components` map:

```yaml
  prompt-panel:
    backgroundColor: "{colors.prompt-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px"
```

Add matching color metadata under `extensions.colorMeta` in `.impeccable/design.json`:

```json
"prompt-surface": {
  "role": "neutral",
  "displayName": "Illuminated Work Surface",
  "canonical": "hsl(190 42% 8.8%)",
  "tonalRamp": ["#071012", "#0d1d20", "#1d3438", "#365055", "#5c7579", "#879da0", "#bac9cb", "#eef4f5"]
}
```

Add one matching component entry, keeping the sidecar valid JSON:

```json
{
  "name": "Prompt Panel",
  "kind": "custom",
  "refersTo": "prompt-panel",
  "description": "The universal generation prompt surface with a focus-aware perimeter runner.",
  "html": "<section class=\"ds-prompt-panel\"><strong>Prompt</strong><textarea>Describe the scene...</textarea></section>",
  "css": ".ds-prompt-panel{background:hsl(190 42% 8.8%);color:#ecf5f5;border:1px solid rgba(194,232,240,.11);border-radius:11px;padding:14px;box-shadow:0 8px 30px -12px rgba(0,8,9,.7);font:400 .875rem/1.45 Geist,system-ui,sans-serif}.ds-prompt-panel textarea{box-sizing:border-box;width:100%;margin-top:10px;min-height:80px;background:#0e191b;color:#ecf5f5;border:1px solid rgba(194,232,240,.14);border-radius:8px;padding:.4rem .75rem;font:inherit}.ds-prompt-panel textarea:focus{outline:none;border-color:rgba(0,255,249,.6);box-shadow:0 0 0 3px rgba(0,255,249,.12)}"
}
```

- [ ] **Step 3: Add the named smoke-test configuration**

Append this object to `.claude/launch.json`'s `configurations` array:

```json
{
  "name": "Universal prompt panel smoke test",
  "type": "node-terminal",
  "request": "launch",
  "command": "npm run dev -- --port 3221",
  "cwd": "${workspaceFolder}"
}
```

- [ ] **Step 4: Validate documentation and JSON**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e "JSON.parse(require('node:fs').readFileSync('.impeccable/design.json','utf8'));JSON.parse(require('node:fs').readFileSync('.claude/launch.json','utf8'));console.log('design and launch JSON valid')"
git diff --check
```

Expected: `design and launch JSON valid`; `git diff --check` exits 0 with no output.

### Task 5: Full verification and localhost sign-off gate

**Files:**

- Verify all modified and created files; no new source files in this task.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run
```

Expected: all test files pass; baseline was 104 files and 1,301 tests, so the total increases by the new Prompt Panel tests.

- [ ] **Step 2: Run lint**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/eslint/bin/eslint.js .
```

Expected: 0 errors. The five pre-existing warnings from the isolated baseline may remain; no new warnings are allowed.

- [ ] **Step 3: Run a production build**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/next/dist/bin/next build
```

Expected: exit 0 and a successful production build.

- [ ] **Step 4: Start the isolated dev server on port 3221**

Run:

```bash
/Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/next/dist/bin/next dev --port 3221
```

Expected: the server reports ready at `http://localhost:3221`.

- [ ] **Step 5: Smoke-test the full interaction**

At `http://localhost:3221`, open an image-generation feature and verify:

1. Prompt section is richer than adjacent panels while the textarea retains its existing surface.
2. The toned-down 12% cyan runner moves clockwise for two seconds, fades while moving, disappears for five seconds, then repeats.
3. Focus during a lap lets that lap finish; no next lap starts while focused.
4. Focus during the quiet pause cancels the queued lap.
5. Blur waits a fresh five seconds before the next lap.
6. Gen Example remains operable and does not activate the textarea focus gate.

Then open `http://localhost:3221/?workspace=video` and verify the same Prompt Panel treatment for Fal, Kie, Runware, Atlas, and Comet without altered model, input, job, or result behavior. Emulate reduced motion once and confirm the runner is absent while the saturated panel remains.

- [ ] **Step 6: Hand the localhost links to the user and wait for explicit sign-off**

Provide both `http://localhost:3221` and `http://localhost:3221/?workspace=video`. Do not push or integrate before the user approves the live result.

- [ ] **Step 7: Stop only the task server after sign-off or when asked**

Stop the process that owns port 3221. Do not remove the worktree or push unless the user explicitly requests shipping.

## Plan self-review

- Spec coverage: surface hierarchy, universal adoption, two-second moving fades, five-second quiet period, toned highlight, focus completion/suppression, blur delay, timer cleanup, reduced motion, provider isolation, docs, full verification, and localhost sign-off all map to explicit tasks.
- Placeholder scan: no TBD, TODO, “implement later,” or unspecified test steps remain.
- Type consistency: `PromptPanel`, `runnerVisible`, `textareaFocusedRef`, `repeatTimerRef`, `prompt-panel-runner`, `--prompt-surface`, and `prompt-panel-lap` use the same names in tests, implementation, CSS, and documentation.
