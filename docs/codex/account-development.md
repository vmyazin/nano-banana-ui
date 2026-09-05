# Account service development

The sign-in milestone adds dedicated `/sign-in` and `/sign-up` pages only. The existing studio layout has no new account calls to action. Guest routes and the legacy self-hosted admin gate are unchanged. Cloud saving and connections are subsequent milestones; the account page does not claim they work yet.

## Run locally

Requires Node 24 (the auth test database uses node:sqlite). Install root and isolated Worker dependencies:

```sh
pnpm install --frozen-lockfile
pnpm --dir cloud install --frozen-lockfile
npm run dev
```

The named worktree scenario in `.claude/launch.json` uses web port 3097 and Worker port 8797. Override with `npm run dev -- --port 3098` and `ACCOUNT_WORKER_PORT=8798` when needed. The startup script copies `cloud/.dev.vars.example` if local variables are absent, keeps its app origin aligned with the web port, and starts both processes. Schema is created on the first local request. Each worktree keeps separate `.wrangler` state. Scheduled cleanup is not automatic locally; trigger it with `curl http://localhost:8797/cdn-cgi/local/scheduled`.

Open http://localhost:3097/sign-up and choose **Use local test account**, then visit `/sign-in` or reload to verify persistence. Sign out revokes the session. Local test login requires both the compile-time local marker and an explicitly localhost app origin plus the dev identity variable. Deploy builds replace the marker with false. Host alone never enables the shortcut; no production request field can switch it on.

## Real Google setup (not yet configured)

Create a Google OAuth **Web application** client with these exact authorized redirects:

- `http://localhost:3097/api/account/callback/google`
- `https://sceneassembly.mzork.com/api/account/callback/google`

Use a separate client/environment for staging. Configure the consent screen and test users as required by Google. Request only openid, email and profile. Put client ID and secret in gitignored `cloud/.dev.vars` for local testing; production values use Wrangler secrets. Never print credentials or write them into tracked files.

The Worker uses oauth4webapi for code exchange and OIDC claim/signature validation, including state, PKCE, nonce, issuer, audience, expiry and verified email. Identity is keyed by Google subject. OAuth attempts are browser-bound, expire in ten minutes and are consumed atomically. Session cookies are HttpOnly and SameSite=Lax; production cookies are Secure with the __Host- prefix. Session tokens are hashed in D1 and expire after 30 days. Sign-in/sign-out POSTs require the configured Origin. Provider tokens are not persisted.

## Cloudflare / Vercel setup (not yet performed)

Create the D1 database and replace the placeholder database ID in `cloud/wrangler.jsonc`. Apply `cloud/migrations/0001_accounts.sql` with Wrangler D1 migrations before enabling the Worker. Production never auto-bootstraps schema. Configure APP_ORIGIN to the canonical HTTPS app origin. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Worker secrets. Configure ACCOUNT_WORKER_ORIGIN in Vercel to the Worker HTTPS origin.

The Next.js gateway allows only account routes and forwards cookies/origin/content-type, never user-ID headers. It preserves redirects and separate Set-Cookie headers and disables caching. Google returns to the app origin through that gateway. Missing backend configuration returns a friendly account-unavailable response without affecting guest routes. Keep AUTH_ADMIN_EMAIL unset: it controls an unrelated legacy local-database gate.

Production migration precedes Worker deployment because code queries the account tables immediately. Enable the Vercel backend origin after the Worker is healthy. No deployment or push is authorized until the user reviews the localhost change.

## Verify

```sh
pnpm test:cloud
pnpm test -- tests/account
pnpm --dir cloud typecheck
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Cloud tests exercise actual SQLite constraints with a D1-shaped test adapter; real D1 behavior is checked in local Wrangler/browser smoke tests. Google cryptographic tests use generated test keys and mocked Google endpoints; they do not replace the final real OAuth smoke test. Browser testing covers sign-up, persisted session on sign-in, sign-out, and guest navigation.

## Saved connection milestone

Signed-in account pages now manage encrypted connections using the same provider labels as the studio. `ACCOUNT_ENCRYPTION_KEYS` is a JSON object mapping key versions to base64-encoded 32-byte AES keys; `ACCOUNT_ENCRYPTION_VERSION` selects the write key. The local launcher generates a key only when absent and keeps it in gitignored `.dev.vars`. Configure separate production secrets before enabling cloud connections. Keep old versions available while re-encrypting existing rows. Authenticated encryption binds each ciphertext to its owner, provider and key version. Connection replacement increments a revision so running jobs can detect a changed credential.

The shared AccountSurface owns the accent edge, stronger border and brief reduced-motion-aware entrance. Existing studio/header calls to action remain unchanged.

## Private media and local reconciliation

`npm run dev` also sets PUBLIC_WORKER_ORIGIN to the selected local Worker port. In production this must be the HTTPS origin serving the Worker. Reference uploads and asset downloads transfer directly through short-lived Worker capabilities; they do not send file bodies through Vercel. The bucket remains private. Upload access expires after ten minutes; input-read access lasts up to 24 hours and is revoked when its job finishes; download access expires after ten minutes and stops working immediately when its asset is deleted.

Temporary reference storage is separate from the saved library: at most 20 MB per file, 32 retained uploads and 256 MB per account. Active jobs retain their inputs; unused/terminal inputs become eligible for cleanup after 24 hours. Upload rows are tombstoned before object deletion so cleanup cannot race a new acceptance. Job intake checks owner, readiness and expiry in the reservation transaction.

Wrangler does not trigger cron automatically in local development. The dev supervisor invokes the same scheduled reconciliation endpoint once per minute after local schema bootstrap. This is local-only; production uses the configured cron trigger. The local seed script now verifies direct upload, cleanup, authenticated library download and scoped byte-range access.

Wrangler is pinned to 4.113.0 with a compatible runtime date because newer local proxies reproduced a fatal Network connection lost error while serving concurrent account requests. Upstream evidence: [Cloudflare local proxy regression](https://github.com/cloudflare/workers-sdk/issues/15002), [empty fatal proxy error](https://github.com/cloudflare/workers-sdk/issues/15317). Recheck the upstream fix and local smoke suite before upgrading. No runtime secrets or production bindings were changed for this workaround.

## Studio account execution

The invisible AccountSessionProvider refreshes session/connection metadata and owner-scoped jobs. useAccountStore is memory-only and clears account results on identity changes. Shared submission helpers bind mutations to the initiating account, so switching accounts during an upload cannot attach the old draft to the new account. Intake retries retain the same token and reference IDs after an uncertain response. Guest stores are never used for cloud jobs.

All studio image/video workspaces now use the shared cloud submission and result components. The existing key dialog includes encrypted account connections above clearly labeled browser-only keys. Browser-only execution remains an explicit choice for a signed-in user; errors and quota rejection never silently switch execution modes. Pollinations background execution requires an account-saved Pollinations key for its current API. Native adapters remain off unless individually enabled with CLOUD_GENERATION_PROVIDERS; see the capability record before enabling any in production.

Common image feature prompt expansion is shared by guest and account requests. Video account results reuse LastFrameActions. Synchronous image engines stage bytes before metadata commit; Check for a saved output looks only for a persisted file and cannot issue another paid call. Inline-input providers accept at most 12 MB of references per job. Inline base64 responses are bounded to 24 MB; provider-specific output-limit verification is still required.

For a credential-free studio image smoke test, set DEV_FAKE_GENERATION=1 in the gitignored cloud/.dev.vars and restart npm run dev. Sign into the local account, save a dummy Kie connection through the existing key dialog, select a Kie image model and submit. The local adapter waits before returning the fixture, so navigate away while Generating and verify Saved later in the account library. This mode is compile-time local-only and does not call a vendor; real Google sign-in and real provider credentials remain separate checks. Turn the flag off before testing real provider behavior.
