# A reference input outlives only the job that needed it

Status: Approved design
Date: 2026-09-07

## Context

SA-01, blocking: every background image-to-video run failed before it started
with "Temporary input storage is full". The message asked the reader to remove
unused uploads, but no screen lists them — and the cloud library they went and
checked sat at 62.7 MB of 1 GB with 0 MB reserved, so nothing visible was full.
Failed on both Runware and fal; "Switch to in-browser" worked immediately.

### Root cause

`reserveUpload` guards three ceilings at once — 256 MB of inputs per user, **32
input rows per user**, and 10 GB globally — and raises one message for all three.
Each background reference occupies a row in `account_uploads`.

Nothing releases that row when the job finishes. The only paths that free one are
`cleanupUploads`, which tombstones solely what is past its 24-hour TTL, and a
`DELETE /api/account/uploads/:id` that the client calls **only when the upload
loop itself fails** (`uploadAccountReferences`'s catch). A run that *succeeds*
therefore holds its slot for a full day.

So 32 successful background runs wedge the account until the next day. Every
observation follows from that: it fails at reservation, before the provider is
ever chosen (hence both Runware and fal); the guest path never touches this
table (hence in-browser works); and the quota the message evokes is a different
table entirely (hence 62.7 MB of 1 GB, 0 reserved).

## Goals

- An input is reclaimed once every job holding it has finished, without waiting
  for the TTL.
- An input still needed by a live job is never reclaimed.
- A reservation that no job has claimed keeps its own expiry.
- The message names something the reader can actually do.

## Non-goals

- **No screen listing raw uploads.** They are plumbing, not artefacts: with the
  leak closed, the ceiling is reachable only by holding 32 references in flight
  at once. A page for them would document the bug rather than fix it.
- No change to the ceilings themselves. Raising 32 would only postpone a leak.
- No change to `reserveUpload`'s guards, to intake, or to the media token path.

## Design

`cleanupUploads` gains a second tombstone pass, next to the TTL one it already
runs:

```sql
UPDATE account_uploads SET state='deleted' WHERE state!='deleted'
  AND EXISTS (SELECT 1 FROM account_job_inputs i WHERE i.upload_id=account_uploads.id)
  AND NOT EXISTS (SELECT 1 FROM account_job_inputs i JOIN account_jobs j ON j.id=i.job_id
                  WHERE i.upload_id=account_uploads.id
                    AND j.deleted=0 AND j.state NOT IN ('saved','failed','cancelled'))
```

The `NOT EXISTS` clause is the one cleanup already used for the TTL pass, so
"which jobs still need this input" keeps a single definition. What is new is
dropping the expiry requirement, and the `EXISTS` that qualifies it.

**Why the `EXISTS` matters.** Reserving and PUTting are two calls. Without it,
cleanup would reclaim a row in the window between them and the upload would fail
with "Upload expired". A row no job has ever claimed is a reservation in flight,
and only its own expiry may take it.

**Why cleanup rather than `finishJob`.** Every terminal path — saved, failed,
cancelled, dismissed, and a job deleted outright — converges on the same
question, and the cron asks it once for all of them. Releasing at each call site
would mean finding them all and keeping them in step. The cost is that a slot
frees on the next 5-minute tick rather than instantly, which is far inside the
time a video generation takes.

**Resume stays safe.** `/resume` accepts only `needs_attention`, which is not in
the terminal list, so a resumable job keeps its inputs.

## Scope and implementation boundary

Lives in `cloud/src/uploads.ts`: the new tombstone pass, and the wording of the
`input_capacity` error.

Must not modify: `reserveUpload`'s ceilings or its guard SQL, `publicMedia`,
`inputUrls`, `cloud/src/jobs.ts`, or the client's upload path.

## Acceptance

- 32 finished runs' inputs, then one cleanup, and reservation succeeds again.
- An input belonging to a live job survives cleanup as `ready`.
- An unattached reservation survives cleanup as `pending`.
- The 409 names waiting for jobs to finish, not a screen that does not exist.

## Deployment

This is Worker code. Vercel deploys `main` on its own; the account Worker does
not. **`cd cloud && npx wrangler deploy` is required**, or the fix is inert in
production while the browser runs a commit that assumes it.
