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

Everything else — Gemini, fal, Kie, Cloudflare credentials — is supplied by each
visitor in their own browser and never reaches the server, so there is nothing
to configure for those.

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
between invocations and differ between concurrent instances. There are also no
sign-in or sign-up routes in the app yet, so turning it on today would lock the
gated routes with no way through.

Enabling it on Vercel means moving `lib/auth/db.ts` to a hosted database first
(a Vercel Marketplace Postgres, or any driver-based store) and adding the
sign-in routes. Until then the app is open, exactly as the unset default
intends.

## Uploads

`/api/fal/upload`, `/api/kie/upload`, and `/api/timeline/render` take multipart
bodies. Vercel Functions accept request bodies up to 100 MB, which is *below*
the app's own `MAX_UPLOAD_BYTES` ceiling of 512 MiB in
`app/api/timeline/render/route.ts`. That mismatch is inert while server render
is off, but it is the first thing to reconcile if the follow-up above happens —
the platform will reject the request long before the route's own check runs.
(The equivalent trap on the VPS was nginx's 1 MB `client_max_body_size` default;
same failure, different ceiling.)

## Self-hosting (the former VPS path)

`scripts/deploy-production.sh` plus the units in `deploy/systemd/` still
describe a working single-box deployment: git fast-forward from `origin/main`,
`pnpm install --frozen-lockfile`, `pnpm build`, `pm2 restart`, health check on
`http://127.0.0.1:3020/`. That path is the one where `TIMELINE_FFMPEG_PATH` and
`AUTH_ADMIN_EMAIL` are worth setting, since it has both a persistent filesystem
and a single long-lived process. Raise nginx's `client_max_body_size` there or
every real clip upload 413s.
