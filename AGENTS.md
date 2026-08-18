## Agent instruction file: router, not encyclopedia

- Keep this file short. It holds (a) a one-paragraph architecture map — a table of
  packages → domain → role, and where state lives, (b) the session workflow, (c) how
  to run locally. Everything deeper goes in `docs/<topic>.md`.
- Maintain an **auto-load routing** section: task type → which doc/skill to read
  *first*. Example: "UI consistency scan → run the `ui-consistency` skill, and first
  read `docs/ui-consistency-seeds.md`." The agent should not discover context by
  grepping; the route tells it what to load.
- Mirror the file for other tools (`AGENTS.md`), and treat it as living: update it
  when a new component pattern, workflow, or convention is established — not at the
  end of the project.
- Write rules **with their rationale inline**. "Use X" gets ignored under pressure;
  "Use X because Y fails when Z" survives. Same for config: comment *why* the deploy
  order is app → content → mcp, not just that it is.

## Session workflow (worktree → smoke-test → ship → wipe)

Assume several agent sessions run against this repo in parallel. The main checkout
must stay clean — never accumulate uncommitted work there.

1. **Start every task in a fresh worktree:** `git worktree add .claude/worktrees/<task-slug> <main-branch>`.
   All edits, typechecks, tests, and dev servers happen inside it.
2. **Pick non-default ports** so parallel sessions don't collide. Keep a registry of
   run configurations (`.claude/launch.json` or equivalent) with a named entry per
   scenario, including the worktree ports.
3. **Smoke-test before shipping.** Then **hand the user the localhost link to the
   affected page** and get an explicit go-ahead. A push to `<main-branch>`
   auto-deploys, so treat this as a hard gate: never ship a UI or behavior change you
   only typechecked. Docs-only changes have nothing to run — say so and skip.
4. **Ship after sign-off:** `git fetch && git rebase origin/<main-branch>` (it moves
   often), then push.
5. **Then stop the servers and remove the worktree.** Don't end a session with work
   uncommitted or unpushed.
6. **If `git status` in the main checkout is dirty, that's another session mid-task.**
   Leave those hunks alone.

If a fresh worktree lacks `node_modules` (hoisted deps) or gitignored dev vars,
document the exact symlink/copy commands to wire it up — an agent should not have to
rediscover them. For this repo, from inside the new worktree:

```sh
ln -s ../../../node_modules node_modules   # deps are installed only in the main checkout
cp ../../../.env.local .env.local          # gitignored dev keys
cp ../../../next-env.d.ts .                # gitignored; without it tsc can't type image imports
cp ../../../public/thumbnails/*.jpg public/thumbnails/ 2>/dev/null || true  # gitignored local assets
```

## Local development must be full-fidelity and credential-free

- `npm run dev` (one command) must bring up the whole system with local emulation of
  every backing service. No cloud account, no login, no shared staging environment.
- **Zero-seed bootstrap:** schema creation runs on first request, so a wiped local
  state still works. Document how to create the first record via `curl` for anything
  that can't bootstrap itself.
- **Auth bypass, tightly gated:** honor a dev identity var from a gitignored
  `.dev.vars` (checked-in `.dev.vars.example`), gated on a signal that *cannot* be
  present in production. Document the failed alternatives — e.g. a `Host ===
  localhost` check does not work under a dev proxy that serves the production Host, so
  gate on an origin var pointing at localhost instead. Never set the bypass var as a
  production secret.
- **Give production-only routing a local equivalent.** If a dimension lives in the
  hostname in prod (tenant subdomains), accept it as a query param locally, pin it in
  a cookie so subsequent links stay scoped, and gate that on the same localhost
  signal. Make in-page links respect it so nothing bounces the agent to production
  mid-test.
- Document the local *divergences* explicitly: which services aren't shared between
  processes, which auth paths have no bypass, and which features need a real key.

## Spec → plan → execute

For anything beyond a small edit, write two documents under `docs/<agent>/`, named
`YYYY-MM-DD-<slug>`:

- **Spec** (`specs/`): Context, Goals, **Non-goals**, and an explicit *scope and
  implementation boundary* naming which function/file the change lives inside and what
  it must not touch. Mark it `Status: Approved design` and treat it as the acceptance
  source.
- **Plan** (`plans/`): a **File map** with `path:line-range` targets and a literal
  "do not modify" list, then tasks broken into `- [ ]` checkbox steps, each naming the
  files it creates/modifies and the command that verifies it.
- Amend rather than rewrite: when a decision is superseded, add a dated **Follow-up
  decision** note at the top saying which task it overrides. The plan is a record, not
  just a queue.

## Repo-specific overlays for generic skills

When a generic skill or checklist would otherwise re-derive the same conclusions:

- Keep a **seeds file** that states the scan roots, the repo's canonical patterns
  (with the reference implementation's file and symbol), and a **baseline list of
  things already extracted** — with the instruction: *do not propose re-creating
  anything listed here.*
- Prefer executable seeds: put the actual `rg` commands in the doc, each with a
  comment explaining what a hit means. The agent runs the query instead of inventing
  one.

## Gates as decision checklists with a bias to "no"

For any recurring judgment call where an agent's default is to over-produce, encode an
ordered checklist where **one "no" ends it**, plus a hard cap. Example, for whether a
changelog entry gets a screenshot: can you name the URL and the element? does the
picture carry something the sentence can't? is it visible at rest? does the seeded demo
data show it honestly? — plus "at most one or two per batch" and "never ship the same
screen twice."

**Never generate demo artifacts from production data.** Screenshots and samples come
from a checked-in seed script against a local server. If showing a change would require
inventing fake people or orgs beyond the seed, skip it.

## Shipping safety

- Path-filter deploy triggers so doc/marketing pushes don't redeploy, and comment
  which paths are bundled at build time and therefore *must* trigger one.
- Use a non-cancelling concurrency group — let an in-flight deploy finish rather than
  killing it mid-upload.
- Comment any ordering dependency between deploy steps at the step itself.

## Commits

- Provide a concise commit message after modifying code; don't commit unless asked.
- For a follow-up request, offer two messages: one covering all changes, one covering
  only the last request.
- No agent attribution or "Generated with …" signature in commit messages.
