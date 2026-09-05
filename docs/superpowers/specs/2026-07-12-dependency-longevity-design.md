# Dependency Longevity Design

## Goal

Keep the application on a single reproducible package-management path and bring its supported dependency set to current compatible releases without taking unrelated ecosystem-breaking upgrades.

## Scope

- Adopt pnpm as the repository's sole package manager and retain `pnpm-lock.yaml` as the only lockfile.
- Remove `package-lock.json`, which conflicts with the pnpm lockfile and can produce non-identical installs.
- Remove `@google/generative-ai`: code discovery found no imports, while all Gemini routes use its supported successor, `@google/genai`.
- Update the supported production stack together: Next.js `16.2.10`, React and React DOM `19.2.7`, `eslint-config-next` `16.2.10`, and `@google/genai` `2.11.0`.
- Refresh the remaining non-breaking dependencies to their latest versions accepted by the existing manifests and regenerate the pnpm lockfile.

## Deliberately Deferred

- TypeScript 7, ESLint 10, Lucide 1.x, and `@types/node` 26 are outside the compatibility-preserving scope because each is a major-version migration.
- No product behavior, routes, or user interface changes are planned. If the Gemini SDK upgrade exposes an API incompatibility, make the smallest source adjustment necessary to preserve existing API responses.

## Implementation and Verification

`package.json` will declare pnpm and pin the framework cohort to known-compatible versions. Dependency installation will update `pnpm-lock.yaml`, remove `package-lock.json`, and ensure the legacy Gemini package is absent. Verification will run the lockfile-only install, lint, production build, and a dependency tree/audit review.

## Success Criteria

- A fresh `pnpm install --frozen-lockfile` succeeds.
- `pnpm lint` and `pnpm build` exit successfully.
- Only `pnpm-lock.yaml` remains.
- `@google/generative-ai` is absent from the manifest and resolved dependency graph.
- No deferred major upgrade enters the manifest or lockfile.
