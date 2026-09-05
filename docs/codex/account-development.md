# Account service development

The optional account path is implemented behind a Next.js gateway and a
Cloudflare Worker using D1, private R2, and Workflows. It adds dedicated
Google-first `/sign-in` and `/sign-up` entry pages and a signed-in `/account`
dashboard without adding global calls to action. Guests keep the existing browser-only studio, keys, library, jobs, and
spend ledger.

This is not production-ready yet. Production resources, OAuth, secrets, and
provider credentials are not configured; no real provider call has been made.
All eight provider adapters exist, but `CLOUD_GENERATION_PROVIDERS` defaults to
empty until each one passes a real provider verification.

## Run locally

Node 24 is required because account tests use `node:sqlite`. Install the root
and isolated Worker dependencies:

```bash
pnpm install --frozen-lockfile
pnpm --dir cloud install --frozen-lockfile
npm run dev
```

The named scenario in `.claude/launch.json` uses web port 3097 and Worker port
8797. Override them with:

```bash
ACCOUNT_WORKER_PORT=8798 npm run dev -- --port 3098
```

The launcher copies `cloud/.dev.vars.example` to the gitignored
`cloud/.dev.vars` when needed, aligns `APP_ORIGIN`, creates a local encryption
key only when one is absent, and sets `PUBLIC_WORKER_ORIGIN`. Migrations `0001`
through `0010` are represented in the development-only zero-seed bootstrap,
which runs on first request. Each worktree has separate `.wrangler` state.

The launcher starts the Next app and local Wrangler Worker in one command. It
also invokes the Worker's scheduled reconciliation endpoint every minute;
Wrangler does not fire cron by itself locally. This tick recovers undispatched
jobs, reconciles spend, and cleans expired OAuth/session, upload, import,
retention, rate-limit, and object-deletion records.

Open <http://localhost:3097/sign-up> and choose **Use local test account**. The
successful sign-in opens `/account`, which composes identity, cloud library and
storage, jobs, saved connections, explicit imports, and deletion controls.
Signed-in users visiting either authentication page also move to `/account`;
guests visiting `/account` move to `/sign-in` after session resolution.
Loading and service errors remain explicit states rather than guest redirects. The
shortcut requires the compile-time local marker, a localhost `APP_ORIGIN`, and
`DEV_ACCOUNT_EMAIL`; deploy builds set the marker false. Host headers or request
fields cannot enable it. Local Google endpoints use mocked cryptography in
tests unless real Google values are supplied.

Set `DEV_FAKE_GENERATION=1` in `cloud/.dev.vars` and restart for the
credential-free full account flow. The fake adapter is compile-time local only.
It exercises the real D1 reservation, Workflow, R2 capture, library, and private
download path but does not verify provider behavior or billing. The seed checks
direct reference input, a local generation, full and byte-range private
downloads, and an idempotent import of the 68-byte PNG fixture:

```bash
node scripts/seed-account-demo.mjs
```

## Implemented behavior

Account connections are encrypted with AES keys in
`ACCOUNT_ENCRYPTION_KEYS`, a JSON map from version to base64-encoded 32-byte
key. `ACCOUNT_ENCRYPTION_VERSION` selects the current write key. Reads expose
only masked metadata, and old versions must remain available during rotation.
An explicit browser-key import uses an if-absent write, so an existing cloud
connection wins and the browser original is never removed.

Cloud jobs live only in the account store and never enter guest job stores.
Submission tokens and immutable request digests make intake idempotent. An
uncertain dispatch is reconciled without a second paid submission. A queued job
can be cancelled only before the provider claim wins. A job in
`needs_attention` can be resumed or marked **Stop tracking**; stopping releases
Scene Assembly's reservation and ends polling/saving, but the provider may
still finish and charge. Existing saved assets stay available and temporary
downloads keep their deadline.

All eight adapters are implemented: fal, Kie, Runware, Atlas, Comet, Gemini,
Cloudflare, and Pollinations. The first five include queue/task or staged-result
recovery appropriate to their transport; synchronous image calls stage output
before metadata commit where possible. Provider flags still default off because
contract tests and compile-only local generation do not replace real vendor
verification.

The permanent library limit is exactly 1,000,000,000 bytes. A job reserves 64
MB for images or 256 MB for video, currently placeholders pending measurement.
Output capture is capped at 1 GB per job. Direct imports accept supported images
or videos up to 1 GB and preserve the browser asset. Each import has a stable
intent and immutable metadata digest. Retrying an interrupted transfer creates
a fenced object attempt; stale attempts are cleaned without deleting a later
successful object. Replaying a completed import returns the existing asset, and
deleted or expired intents cannot resurrect it.

Temporary references allow 20 MB per image, 32 ready uploads and 256 MB per
account, and 10 GB across the service. Inline-input providers accept 12 MB per
job and inline responses are capped at 24 MB. The service allows three active
jobs per account and 100 globally. New intake is blocked while the owner has a
live temporary overflow; the global 100-job bound also counts terminal jobs that
still hold temporary results, independently of released active-job slots.
Replaying an already accepted job remains possible, and permanent assets are
never evicted. These values bound the implementation; the 64/256 MB reservations
and provider-specific limits must be measured before launch.

If a completed result does not fit the permanent quota, it remains privately
downloadable for 24 hours. Freeing space and resuming saves those same bytes
without another provider call. Permanent assets have no automatic expiry.

The account spend ledger is stored in D1 and remains separate from the browser
ledger. Both use the canonical resolvers in `lib/spend/resolve.ts`; figures stay
exact, estimated, or unknown when trustworthy rate/usage data is unavailable.
Spend capture follows a confirmed provider result even when saving needs
attention, and reconciliation repairs a missed ledger insert without affecting
the completed generation. Account spend and asset endpoints return 50 rows at a
time. **Older assets** pages the library explicitly; **Load older records**
appends another spend page and pauses automatic latest-page replacement for
that scope.

Reference uploads and account imports/downloads use short-lived direct Worker
capabilities, so file bytes do not pass through Vercel. The R2 bucket stays
private. Capability URLs are owner- and purpose-scoped, and deletion immediately
revokes metadata access before queued object cleanup.

## Ingress and observability

The Worker bounds metadata request bodies before parsing them: jobs 40,000
bytes, connections 8,192 bytes, imports 32,768 bytes, and other account POSTs
2,048 bytes. Per-minute D1-backed budgets are 600 owner reads, 120 owner writes,
20 job submissions, 3,000 signed-out account requests, and 120 OAuth starts.
Cross-site mutations are rejected before session and counter work. See
[`cloud/src/ingress.ts`](../../cloud/src/ingress.ts) for the executable limits.

`cloud/wrangler.jsonc` keeps Worker observability enabled but disables invocation
logs because private media capabilities appear in URL paths. Do not enable
invocation URL logging without first redacting those paths.

## Local and production configuration

`cloud/.dev.vars.example` defines `APP_ORIGIN`, `DEV_ACCOUNT_EMAIL`, optional
local `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, and
`DEV_FAKE_GENERATION`. The launcher supplies `PUBLIC_WORKER_ORIGIN` and local
encryption keys. Next receives `ACCOUNT_WORKER_ORIGIN` separately.

To test real Google OAuth locally, create a Web application client with
`http://localhost:3097/api/account/callback/google` as an authorized redirect
and put its ID and secret only in `cloud/.dev.vars`. Use a separate client for
production, whose authorized redirect is
`https://sceneassembly.mzork.com/api/account/callback/google`. Request only
`openid`, `email`, and `profile`.

Production needs the `DB`, `ASSETS`, and `GENERATION` bindings from
`cloud/wrangler.jsonc`; `APP_ORIGIN` and `PUBLIC_WORKER_ORIGIN`; Google and
encryption secrets; and Vercel `ACCOUNT_WORKER_ORIGIN`. Keep
`AUTH_ADMIN_EMAIL` unset on Vercel. It controls an unrelated legacy SQLite gate;
the new account pages do not make that gate suitable for serverless deployment.

Apply D1 migrations before deploying the Worker, then verify OAuth through an
isolated preview app with a working gateway and matching origin/callback before
connecting the production app. The detailed order and external setup checklist
are in [`docs/deployment.md`](../deployment.md). Production setup requires user
credentials and potentially billing consent, and remains later work. Get user
review and localhost sign-off before any push because `main` deploys
automatically.

## Recovery and retention

[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
provides 7 days on Workers Free and 30 days on Workers Paid. It restores the
database only and cannot restore R2 objects. Define coordinated D1/R2 backups
and complete a restore exercise before launch.

Configure the private bucket's
[R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
to abort incomplete multipart uploads after one day. Do not set permanent asset
expiry. Application cleanup covers abandoned imports, temporary results,
deleted objects, and deleted-account prefix rescans; the bucket lifecycle is a
last-resort multipart cleanup rather than the account retention policy.

## Verification

```bash
pnpm test:cloud
pnpm test -- tests/account
pnpm --dir cloud typecheck
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Cloud tests use SQLite behind a D1-shaped adapter. Google tests generate keys
and mock Google endpoints. The local fake generation is compile-only and calls
no vendor. Release verification still requires real Google OAuth and one
credentialed end-to-end job for each enabled provider, including background
completion after closing the browser, private download, spend classification,
and failure/reconciliation behavior.
