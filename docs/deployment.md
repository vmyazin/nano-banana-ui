# Deployment

The live app runs on **Vercel** at <https://sceneassembly.mzork.com>. Pushes to
`main` on `github.com/vmyazin/nano-banana-ui` deploy automatically through
Vercel's Git integration; there is no deploy script to run by hand.

It previously ran on a single VPS behind nginx, under pm2, redeployed by a
systemd timer polling `origin/main` every minute. That path is kept — see
[Self-hosting](#self-hosting-the-former-vps-path) — but it is no longer the one
serving the site.

## Environment variables

Set on the Vercel project (Production + Preview), not in the repo:

| Variable | Required | Notes |
| --- | --- | --- |
| `HF_TOKEN` | no | Server-side, app-owned. Enables the shared micro-AI tier for download filenames and example prompts. Unset and those fall back to the user's Gemini key, then to a regex slugifier. |
| `HF_BASE_URL` | no | Overrides the OpenAI-compatible endpoint the micro-AI tier calls. |
| `AUTH_ADMIN_EMAIL` | **must stay unset** | See [The auth gate](#the-auth-gate-off-on-vercel) — the account store cannot survive on serverless as written. |
| `TIMELINE_FFMPEG_PATH` | **must stay unset** | See [Server-side export](#server-side-export-off-on-vercel). |
| `ACCOUNT_WORKER_ORIGIN` | no, until account launch | HTTPS origin of the separately deployed account Worker. Leave unset until that Worker, its migrations, and OAuth have been verified; guest routes keep working while it is absent. |

Guest Gemini, fal, Kie, and Cloudflare credentials are supplied by each visitor
and kept in browser storage. Active guest requests may proxy a credential
through a Next.js provider route, but the route does not persist it. The
optional account Worker instead stores credentials encrypted; its variables and
secrets are documented below.

## Server-side export (off on Vercel)

`POST /api/timeline/render` 404s unless `TIMELINE_FFMPEG_PATH` names an ffmpeg
binary, and on Vercel it stays unset. Exports run entirely in the browser on the
WebCodecs engine, which the export panel already prefers; when the browser
engine can't handle a timeline, the panel reports *"No server render is
configured"* instead of offering a fallback. Nothing is broken by this — the
degradation was designed in — but timelines that WebCodecs rejects (unsupported
codecs, browsers without `VideoEncoder`) have no second path on Vercel.

The route cannot simply be switched on there. Its design assumes one long-lived
process:

- the job registry (`lib/timeline/jobs.ts`) is in-memory, so the POST that
  creates a job, the GET that polls it, and the GET that downloads its output
  must all land on the same instance — serverless gives no such guarantee;
- inputs and outputs live under `os.tmpdir()`, which is per-invocation;
- `spawn('ffmpeg')` needs a binary that isn't in the runtime image.

### Follow-up: make the render engine portable

Worth doing if browser-only export proves too narrow. The shape that runs both
on Vercel and on a box:

1. **Ship the binary.** Depend on a static ffmpeg build (`ffmpeg-static` or
   similar) and resolve `TIMELINE_FFMPEG_PATH` to it when the env var is unset,
   so the "which binary am I spending CPU on" property that motivated the
   explicit path is preserved — it just gains a default.
2. **Collapse the lifecycle into one request.** Upload → render → respond with
   the file, inside the 300 s function limit, dropping the poll/download round
   trips and with them the cross-request state. A few short clips fit; long
   timelines don't, which is the real bound on this approach.
3. **Or externalize the state** if step 2's ceiling is too low: job rows in a
   hosted DB, inputs and outputs in Vercel Blob, and a function that picks up
   where the last invocation left off. More moving parts, no wall-clock limit.
4. Keep `lib/timeline/render/port.ts` as the seam either way — both engines
   already implement `RenderEngine`, so nothing in the export panel changes.

## The auth gate (off on Vercel)

`AUTH_ADMIN_EMAIL` turns on the gate over `/api/fetch-image` and
`/api/timeline/render`. It must stay unset here: the account store is SQLite via
`node:sqlite` writing to a local file (`lib/auth/db.ts`), and a serverless
filesystem is per-instance and ephemeral — accounts and sessions would vanish
between invocations and differ between concurrent instances. The dedicated
`/sign-in` and `/sign-up` pages belong to the separate optional Cloudflare
account service. They do not supply sessions for this legacy gate, so setting
`AUTH_ADMIN_EMAIL` on Vercel would still lock its protected routes.

Enabling the legacy gate on Vercel still requires moving `lib/auth/db.ts` to a
hosted database and integrating its own session path. Until then the app is
open, exactly as the unset default intends.

## Uploads

`/api/fal/upload`, `/api/kie/upload`, and `/api/timeline/render` take multipart
bodies. Consult Vercel's current
[Functions limits](https://vercel.com/docs/functions/limitations) before
changing these paths; the current documented Function request/response payload
limit is 4.5 MB, smaller than the app's own `MAX_UPLOAD_BYTES` ceiling of 512 MiB in
`app/api/timeline/render/route.ts`. That mismatch is inert while server render
is off, but it is the first thing to reconcile if the follow-up above happens —
the platform will reject the request long before the route's own check runs.
(The equivalent trap on the VPS was nginx's 1 MB `client_max_body_size` default;
same failure, different ceiling.)

Account uploads and downloads avoid this path. The Next gateway carries only
bounded JSON metadata; short-lived capabilities transfer file bytes directly to
the private R2-bound Worker.

## Optional Cloudflare account service (not launched)

The account implementation uses a Cloudflare Worker, D1, a private R2 bucket,
and a `GenerationWorkflow` binding. It provides Google-first `/sign-in` and
`/sign-up` entry pages, a signed-in `/account` dashboard, encrypted account connections, durable background jobs, explicit
browser-asset/key imports, a fixed 1 GB permanent library, and a separate
account spend ledger. Guest use remains available and there are no new global
account calls to action.

The code supports fal, Kie, Runware, Atlas, Comet, Gemini, Cloudflare, and
Pollinations background adapters. Production support is deliberately opt-in via
`CLOUD_GENERATION_PROVIDERS`; its default is empty. Do not enable an adapter
until a real credentialed submission, reconciliation, capture, download, and
cost-label check has passed in the target environment. No real vendor request,
production Google OAuth setup, or account Worker deployment has been
completed for this worktree. The dedicated Cloudflare database and private
bucket are provisioned as recorded below.

### Local OAuth setup verified — 2026-09-05

The `scene-assembly-accounts` Google project now has a dedicated local Web
application client, with only
`http://localhost:3097/api/account/callback/google` authorized. Real Google
consent, callback, session persistence, sign-out, and returning sign-in passed
against the local account service. The audience remains External / Testing.
See [local account development](codex/account-development.md#real-google-sign-in-for-local-development)
for the credential location and exact boundaries. Production OAuth configuration
and consent branding are still pending; do not reuse the local client as an
implicit production configuration.

### Cloudflare resource setup — 2026-09-05

The user resumed setup through the Cloudflare browser open on **Rapid Systems**.
Created the dedicated resources in account `7f64edc36bdefec27b66e6ff9b2dcc3d`:

| Resource | Configuration |
| --- | --- |
| D1 `scene-assembly-accounts` | ID `a5146fdd-41c6-47d3-adff-8c7aeddc3071`; all 11 migrations applied; zero account rows |
| R2 `scene-assembly-assets` | Standard storage, Eastern North America, public development URL disabled, no custom domain |
| Multipart lifecycle | Enabled for all prefixes; abort incomplete uploads after one day; no completed-object expiry |

`cloud/wrangler.jsonc` now pins this account and database ID. Its
`preview_database_id` retains the original local-only identity so development
sessions, encrypted connections, and local assets remain reachable. It is not a
remote preview database; provision a separate database for a remote preview.
Do not run remote preview commands using that local-only ID.

Verification: remote migration count is 11, the avatar column exists, and the
new database contains no accounts. Wrangler independently confirmed the one-day
multipart lifecycle and disabled r2.dev access. Worker dry-run bundles all three
bindings successfully. A browser reload preserved the existing local Google
account. No existing resources, billing settings, application deployment, or
production user data were changed.

The Worker and `GenerationWorkflow` are configured but not published. Production
Google OAuth, Worker origin and secrets (including independent production
encryption keys), preview integration, provider acceptance, and backup/restore
verification remain pending. The next deployment requires the repository's
localhost review/sign-off; no push or deployment was performed in this step.

### Production runbook

The person performing setup needs Cloudflare, Google Cloud, Vercel, and provider
credentials, and may need to accept billing. Never put secret values in tracked
files.

1. The dedicated D1 database and R2 bucket above are already created and
   recorded in `cloud/wrangler.jsonc`. For another environment, provision separate
   resources and update its explicit IDs. Keep the binding names exactly `DB`, `ASSETS`, and
   `GENERATION`; the Workflow class is `GenerationWorkflow`. The R2 bucket must
   remain private.
2. Configure the Worker variables `APP_ORIGIN=<target app HTTPS origin>`
   and `PUBLIC_WORKER_ORIGIN=<worker HTTPS origin>`. Keep the checked-in cron and
   the Workflow binding; production reconciliation runs every five minutes.
   The config disables invocation logs because media
   capabilities live in private URL paths.
3. Configure Worker secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `ACCOUNT_ENCRYPTION_KEYS`, and `ACCOUNT_ENCRYPTION_VERSION`. The encryption
   key map is JSON from version strings to base64-encoded 32-byte AES keys; keep
   old versions during rotation.
4. Create a Google OAuth Web application and authorize
   `https://sceneassembly.mzork.com/api/account/callback/google`. Request only
   `openid`, `email`, and `profile`, and complete the consent-screen requirements.
5. Apply every checked-in migration (`0001` through `0011`) in order **before**
   deploying the Worker, because the Worker immediately queries the current schema:

   ```bash
   pnpm --dir cloud exec wrangler d1 migrations apply scene-assembly-accounts --remote
   pnpm --dir cloud exec wrangler deploy
   ```

6. First verify through an isolated preview app connected with
   `ACCOUNT_WORKER_ORIGIN`, using that preview's exact `APP_ORIGIN` and Google
   callback in a separate environment. OAuth needs this working app gateway;
   Worker health alone cannot verify login. Check real Google sign-in, private
   direct upload/download, range download, and one provider at a time. Add only the verified provider
   names to `CLOUD_GENERATION_PROVIDERS`; the all-provider value is
   `fal,kie,runware,atlas,comet,gemini,cloudflare,pollinations`, but it is not a
   launch default.
7. After verification, apply the tested configuration to the production
   resources with `APP_ORIGIN=https://sceneassembly.mzork.com` and the production
   callback. Set production Vercel `ACCOUNT_WORKER_ORIGIN` to the healthy Worker
   origin, redeploy the web app, and repeat the login/download smoke check.
   `PUBLIC_WORKER_ORIGIN` belongs to the Worker;
   `ACCOUNT_WORKER_ORIGIN` belongs to Vercel.

Get explicit user review and localhost sign-off before pushing. A push to
`main` deploys the web app automatically.

### Capacity, recovery, and lifecycle setup

The 1 GB permanent quota is fixed. Intake currently reserves 64 MB for an image
job and 256 MB for a video job; these are placeholders that need measurements
from real provider outputs before launch. The 20 MB reference-file, 12 MB inline
reference, 24 MB inline response, 1 GB job-output/import, concurrency, and rate
limits are application safety bounds rather than verified model entitlements.
New intake is blocked while that account has a retained temporary overflow, and
the global 100-job bound counts retained temporary results after their active
job slots are released. Replays of already accepted jobs remain available;
permanent assets are never evicted. Record measured payloads and provider and
platform limits in the deployment plan before enabling each adapter.

[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
retains 7 days on Workers Free and 30 days on Workers Paid. It restores D1 only;
it cannot restore R2 media. Before launch, define a coordinated D1-and-R2 backup
procedure and complete a restore exercise. Configure an
[R2 object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
to abort incomplete multipart uploads after one day. Do not add a blanket asset
expiry rule: permanent account assets must remain until the user deletes them.

## Self-hosting (the former VPS path)

`scripts/deploy-production.sh` plus the units in `deploy/systemd/` still
describe a working single-box deployment: git fast-forward from `origin/main`,
`pnpm install --frozen-lockfile`, `pnpm build`, `pm2 restart`, health check on
`http://127.0.0.1:3020/`. That path is the one where `TIMELINE_FFMPEG_PATH` and
`AUTH_ADMIN_EMAIL` are worth setting, since it has both a persistent filesystem
and a single long-lived process. Raise nginx's `client_max_body_size` there or
every real clip upload 413s.
