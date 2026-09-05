# Optional account implementation review — 2026-09-05

Scope: the optional Cloudflare account implementation, its Next gateway, and account client state in the `codex/account-cloud-plan` worktree. This is an implementation review with local emulation and deterministic fixtures, not a production readiness certification. No real Google credentials, production resources, or paid provider requests were used.

## Review and fixes

The parent integrated and verified the work; a Sol high worker independently reviewed authentication, imports, job recovery, storage lifecycle, and account isolation.

| Finding | Resolution |
| --- | --- |
| Initial imports could bypass the live-attempt limits by repeatedly cancelling and creating fresh IDs. | Initial insertion now checks the same account/global attempt limits atomically as retries. SQLite regressions assert rejected requests create neither intent, attempt, nor reservation. |
| A lost upload process could leave an import stuck, while reuse of the same object key risked an older transfer replacing newer bytes. | Retries use fenced attempt numbers and distinct object keys. Only the current attempt can finalize quota and metadata; superseded objects are cleaned repeatedly. |
| One failed R2 cleanup could stop later cleaners and leave expired reservations charged. | Per-row failures retain retry metadata, and scheduled subsystems run independently. Final fault-injection verification is recorded in the plan. |
| Stopping tracking could leave synchronous provider output without an asset row permanently in R2. | A bounded terminal-job cleanup journal sweeps deterministic output keys after a recovery grace period, protects live assets, and rescans for late writes. |
| Releasing a stopped job's active slot could hide its still-retained overflow from the service bound. | New intake blocks on an owner's unresolved temporary outputs; the global job-slot calculation also counts retained terminal-job outputs until cleanup. Idempotent replay remains available. |
| Account-service failure could hide the guest spend ledger; stale destructive callbacks could survive a same-owner session change. | Browser spend remains usable during outages. Clear intents include owner, session epoch, and source; account mutations check their scope before sending requests. |

## Controls verified locally

- OAuth state, PKCE, nonce and verified identity checks use `oauth4webapi`; tests use generated signing keys and mocked endpoints. Sessions are hashed, revocable, and scoped by cookies. The local shortcut cannot be enabled by production request fields.
- Saved provider connections use versioned authenticated encryption with owner/provider binding. Explicit imports cannot overwrite an existing account connection. Responses expose masked metadata only.
- Job acceptance, quota reservations, cancellation, dismissal, import finalization, and deletion are exercised against SQLite constraints through the D1 test adapter. Local Wrangler smoke tests cover actual D1, R2, and Workflows emulation.
- Owner/epoch checks prevent delayed account reads or file operations from populating another session. Account state stays separate from persisted browser stores. Imports start unchecked and preserve originals.
- Metadata bodies have actual streamed byte ceilings; fixed-window account/global ingress budgets use D1. Large files use bounded direct Worker transfers. Worker invocation URL logging is disabled because private file capabilities appear in paths.
- Known provider results retry saving without generating again. An ambiguous chargeable submission without a recoverable handle remains needs-attention; stopping tracking never claims vendor cancellation.

## Remaining launch gates

1. Configure actual Google OAuth and Cloudflare resources/secrets with the user, then verify exact callbacks, sessions, origin checks, migrations, bindings, and cross-device access.
2. Keep native-provider flags disabled until each adapter passes credentialed acceptance/recovery and output-limit checks. Current 64 MB image and 256 MB video reservations are engineering placeholders. The per-job 1 GB output ceiling and concurrency limits do not prove vendor maxima.
3. Configure private-bucket multipart cleanup and a coordinated database/media backup and recovery procedure. D1 Time Travel alone cannot restore deleted R2 objects. Follow the setup details in [account development](account-development.md) and [deployment](../deployment.md).
4. Review localhost UI and behavior before push/deployment, as required by the repository workflow.

Rate budgets and encrypted storage do not imply unlimited abuse resistance, end-to-end encryption, or provider billing guarantees. Saved connection validation checks format and encryption; it does not confirm that a vendor will accept or bill that key. Credential replacement may leave an already accepted job needing its original connection revision, and must never silently switch the billing identity.
