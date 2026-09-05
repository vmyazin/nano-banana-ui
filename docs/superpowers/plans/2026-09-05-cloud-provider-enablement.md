# Plan: cloud background generation for every provider

Design: `../specs/2026-09-05-cloud-provider-enablement-design.md`

## File map

| Path | Range | Change |
|---|---|---|
| `cloud/src/providers.ts` | 28-31 | Extract the duplicated provider literal into an exported `CLOUD_PROVIDERS` constant and filter against it. |
| `cloud/wrangler.jsonc` | 10-11 | Set `CLOUD_GENERATION_PROVIDERS` to all eight, with the rationale comment. |
| `cloud/tests/providers-config.test.ts` | new | Assert the checked-in production configuration enables every `CLOUD_PROVIDERS` entry, and that other values still filter. |
| `docs/codex/cloud-provider-capabilities.md` | 30-36 | Replace the "production native providers default off" statement once live checks pass. |
| `docs/superpowers/plans/2026-09-05-cloud-provider-enablement.md` | this file | Record live verification results per provider. |

Follow-up decision 2026-09-05: task 5's smoke test added two rows to the file map
and overrode the components entry in the "do not modify" list. See the design
document's follow-up note.

| `components/GenerationInterface.tsx` | 1099, 1114 | Gate the fal/Cloudflare connect callouts on the account connection when in cloud mode. |
| `tests/account/execution.test.tsx` | new case | Signed-in fal cloud mode hides the browser-key callout, submits, and still asks when no connection is saved. |

Do not modify: `cloud/src/provider-adapters/*`, `cloud/src/assets.ts`,
`cloud/src/limits.ts`, `cloud/src/retention.ts`, `cloud/src/jobs.ts`,
`lib/account/useCloudWorkspace.ts`, `components/*`, `cloud/wrangler.preview.jsonc`.

## Tasks

- [x] 1. Extract `CLOUD_PROVIDERS` in `cloud/src/providers.ts` so `enabledProviders`
      filters against one list instead of two copies of the same literal.
      Verify: `pnpm --dir cloud test` and `pnpm --dir cloud typecheck`.
- [x] 2. Enable all eight in `cloud/wrangler.jsonc`, keeping an inline comment that
      says why the list is exhaustive and what un-enabling one means.
      Verify: `npx wrangler deploy --dry-run` inside `cloud/`.
- [x] 3. Add `cloud/tests/providers-config.test.ts` covering the checked-in
      production config and the filtering of unknown/absent values.
      Verify: `pnpm --dir cloud test`.
- [x] 4. Full local checks: worker tests, root `npx vitest run`, both typechecks,
      `npm run lint`, `npm run build`.
- [x] 5. Local smoke: run the dev supervisor on non-default ports with
      `DEV_FAKE_GENERATION=1`, sign in locally, and confirm a previously blocked
      workspace (fal) now offers background generation instead of the red notice.
      Hand the user the localhost link and wait for go-ahead.
      Result: fal job 8c96652c-e881-4bc4-bd07-eac27d265cf6 was accepted, reached
      `saved`, autosaved to the cloud library as `fal · image · 68 B`, and released
      its reservation to 0 MB. The fixture adapter, not fal, produced the bytes, so
      this proves the account job path for a non-Gemini provider, not fal's vendor
      contract. It also surfaced the connect-callout defect recorded above.
- [x] 6. Deploy the Worker (`npx wrangler deploy`) after sign-off. Record the
      version ID.
      Result: user approved 2026-09-05. `main` pushed at `c1f79ae`. Worker
      deployed from the pinned local Wrangler 4.113 as version
      `2bfca5fe-d9f8-452e-9afe-1685141cd611`; the global `npx wrangler` is 4.129
      and cannot resolve `oauth4webapi` without `pnpm install` in `cloud/`, so
      deploy through `cloud/node_modules/.bin/wrangler`. The unauthenticated
      production session endpoint now reports all eight providers. No live
      generation has been submitted, so seven providers are enabled but unverified.
- [ ] 7. Live acceptance per provider, one at a time, smallest available output.
      Requires a saved production connection for each. For each: submit, close the
      submission tab, then confirm from a new tab that the job reached `saved`,
      the asset opens at the expected size, reserved bytes returned to zero, and
      exactly one spend entry exists. Record the job ID and outcome below.
- [ ] 8. Remove any provider that failed its live check from the variable,
      redeploy, and record the failure. Do not resubmit a paid job to "confirm" an
      ambiguous acceptance.
- [ ] 9. Update `docs/codex/cloud-provider-capabilities.md` and `AGENTS.md` routing
      if the enablement rule changed, then rebase onto `origin/main` and push.

## Live verification record

Connections saved in production before this task: Atlas, Comet, Gemini. fal, Kie,
Runware, Cloudflare and Pollinations need their keys added at `/account` before
their checks can run.

| Provider | Job ID | Tab-closed completion | Library asset | Reserved bytes released | Spend entries | Result |
|---|---|---|---|---|---|---|
| gemini | 52882d1a-6b66-46b1-8ae1-7f4c831ca2c2 | 21.577 s | 1024 px, 558.9 KB | yes | 1 ($0.1436) | passed 2026-09-05 (prior task) |
| fal | | | | | | pending |
| kie | | | | | | pending |
| runware | | | | | | pending |
| atlas | | | | | | pending |
| comet | | | | | | pending |
| cloudflare | | | | | | pending |
| pollinations | | | | | | pending |
