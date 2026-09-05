# Cloud background generation for every provider

Status: Approved design

## Follow-up decision — 2026-09-05

Overrides the "no component change" line in *Scope and implementation boundary*
below. The local smoke test showed that enabling fal exposes a latent defect:
`components/GenerationInterface.tsx` gates its fal and Cloudflare "Connect your …
key to use this engine" callouts on the *browser* key even when the workspace is
in cloud mode, so a signed-in person with a saved account connection is told to
connect a provider they already connected — on the same screen that says the job
will run in the background. Submission itself was unaffected (verified: a fal job
reached `saved` and autosaved to the library while the callout was showing), so
this is presentation only. Both callouts now read the account connection in cloud
mode. No other component changes.

## Context

Signed-in users see "Background generation is not available for this provider yet.
You can explicitly choose browser-only generation below." on every workspace except
Gemini. The message is thrown by `lib/account/useCloudWorkspace.ts:27` when the
provider is missing from the session's `providers` array, which the Worker builds
from `enabledProviders(env)` (`cloud/src/index.ts:61`).

Nothing is missing from the implementation. All eight engines already have Worker
adapters — `queued.ts` (fal, Kie), `aggregators.ts` (Runware, Atlas, Comet) and
`synchronous.ts` (Gemini, Cloudflare, Pollinations) — with per-provider request
validators, and `safeResultUrl` (`cloud/src/assets.ts:19`) already allowlists the
output hosts of every provider that returns a URL. The single gate is the
production variable `CLOUD_GENERATION_PROVIDERS`, set to `"gemini"` in
`cloud/wrangler.jsonc:11`.

Gemini is enabled alone because it is the only provider that has passed the live
acceptance check recorded in
`docs/codex/plans/2026-09-04-optional-cloud-accounts.md`: a real paid job that
completed and autosaved to the account library after its submission tab was closed,
with a released quota reservation and exactly one priced spend entry.

## Goals

- Every provider in `CloudProvider` (excluding the local fixture `local-test`)
  accepts background generation in production.
- Each newly enabled provider passes the same live acceptance check Gemini passed
  before it ships enabled, because an adapter that fails against the real vendor
  spends the user's money and leaves a `needs_attention` job behind.
- Enabling a future ninth provider cannot silently forget the production variable.

## Non-goals

- No change to adapter behavior, request validation, output host allowlisting,
  quota reservation values, or retention. The reservation figures remain the
  documented engineering placeholders; measuring true vendor maxima is separate
  launch work.
- No change to guest/browser-only generation, which never consults this variable.
- No change to which providers a person can save a connection for — that list is
  already complete.
- No public Google consent publishing, backup-recovery acceptance, or model
  migration.

## Scope and implementation boundary

The behavior change lives entirely in the value of `CLOUD_GENERATION_PROVIDERS` in
`cloud/wrangler.jsonc`, plus a shared constant in `cloud/src/providers.ts` that
`enabledProviders` filters against so the accepted list and the `CloudProvider`
union cannot drift apart.

Must not touch: any file under `cloud/src/provider-adapters/`, `cloud/src/assets.ts`,
`cloud/src/limits.ts`, `cloud/src/retention.ts`, `cloud/src/jobs.ts`,
`lib/account/useCloudWorkspace.ts`, any component, or `cloud/wrangler.preview.jsonc`
(the preview environment deliberately enables nothing).

## Acceptance

1. `enabledProviders` returns all eight production providers when given the
   checked-in production configuration, and still returns only what the variable
   names for any other value.
2. Worker tests, both typechecks, root lint, the Next production build and the
   Worker deployment dry-run pass.
3. For each of the seven newly enabled providers, in production, with a saved
   account connection: one small job is accepted, completes while its submission
   tab is closed, appears in the account library at the expected size, releases its
   quota reservation, and records exactly one spend entry. Results are recorded in
   the plan document with job IDs.
4. A provider whose live check fails is removed from the variable again before the
   deployment is left in place, and the failure is recorded rather than retried
   blindly — a paid submission is not idempotent.
