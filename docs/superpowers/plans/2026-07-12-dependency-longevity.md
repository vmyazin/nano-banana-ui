# Dependency Longevity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the supported dependency cohort, remove the unused legacy Gemini SDK, and make pnpm the only reproducible package-management path.

**Architecture:** This is a dependency-configuration change. `package.json` declares versions and pnpm generates the sole committed dependency graph in `pnpm-lock.yaml`. No application API or UI contract is intended to change; the build exercises the existing Gemini SDK call sites against the updated package graph.

**Tech Stack:** pnpm 10, Next.js 16.2, React 19.2, TypeScript 5, ESLint 9, Tailwind CSS 4, `@google/genai` 2.

---

### Task 1: Align the declared package-manager and framework cohort

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Record the current declared and resolved versions**

Run: `pnpm outdated --format json && pnpm why @google/generative-ai`

Expected: the report shows the available Next 16.2.10, React 19.2.7, and `@google/genai` 2.11.0 releases; `pnpm why` shows no direct source dependency on the legacy Gemini SDK.

- [ ] **Step 2: Update the manifest with pnpm and the compatible release cohort**

Set `packageManager` to `pnpm@10.32.1`; remove `@google/generative-ai`; set `next` and `eslint-config-next` to `16.2.10`, `react` and `react-dom` to `19.2.7`, and `@google/genai` to `2.11.0`. Leave TypeScript 5, ESLint 9, Lucide 0.x, and Node 20 types on their current major lines.

- [ ] **Step 3: Validate that the legacy package cannot be declared**

Run: `node -e "const p=require('./package.json'); if (p.dependencies?.['@google/generative-ai']) process.exit(1); if (p.packageManager !== 'pnpm@10.32.1') process.exit(1)"`

Expected: exit code 0.

- [ ] **Step 4: Commit the manifest-only change**

```bash
git add package.json
git commit -m "chore: modernize supported dependencies"
```

### Task 2: Regenerate the single dependency graph

**Files:**

- Modify: `pnpm-lock.yaml`
- Delete: `package-lock.json`

- [ ] **Step 1: Install from the updated pnpm manifest**

Run: `pnpm install`

Expected: `pnpm-lock.yaml` resolves the exact declared Next/React/Google SDK versions and has no unresolved peer-dependency errors.

- [ ] **Step 2: Remove the conflicting npm lockfile**

Run: `rm package-lock.json`

Expected: `pnpm-lock.yaml` is the repository's only package-manager lockfile.

- [ ] **Step 3: Verify reproducibility and legacy-SDK removal**

Run: `pnpm install --frozen-lockfile && ! rg -n '"@google/generative-ai"|@google/generative-ai@' package.json pnpm-lock.yaml`

Expected: frozen installation succeeds; the search produces no matches.

- [ ] **Step 4: Commit the resolved dependency graph**

```bash
git add pnpm-lock.yaml package-lock.json
git commit -m "chore: standardize on pnpm lockfile"
```

### Task 3: Exercise the full application against the upgraded graph

**Files:**

- Modify only if required by updated SDK types: `lib/engines/gemini.ts`, `app/api/example/route.ts`, `app/api/slug/route.ts`

- [ ] **Step 1: Run static checks before any source change**

Run: `pnpm lint && pnpm build`

Expected: both commands exit 0. If either reports a type or SDK API incompatibility, capture the exact diagnostic before editing source.

- [ ] **Step 2: Make only a diagnostic-driven compatibility edit, if needed**

Keep the current request/response behavior: Gemini image generation returns base64 image data and MIME type; example and slug routes continue returning their existing JSON fields. Do not change routes, UI behavior, models, or credential handling.

- [ ] **Step 3: Re-run the complete static and production verification**

Run: `pnpm lint && pnpm build && pnpm audit --prod`

Expected: lint and build exit 0; audit findings, if any, are recorded separately rather than suppressed.

- [ ] **Step 4: Inspect the final change set**

Run: `git diff --check && git status --short && pnpm list --depth 0`

Expected: no whitespace errors; the manifest and pnpm lockfile agree; neither `package-lock.json` nor `@google/generative-ai` remains.

- [ ] **Step 5: Commit any verified compatibility adjustment**

```bash
git add lib/engines/gemini.ts app/api/example/route.ts app/api/slug/route.ts
git commit -m "fix: preserve Gemini SDK compatibility"
```
