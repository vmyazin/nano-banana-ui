# Plan — a reference input outlives only the job that needed it

Spec: `docs/claude/specs/2026-09-07-input-slot-release-design.md`
Date: 2026-09-07

## File map

| Path | Target | Change |
| --- | --- | --- |
| `cloud/src/uploads.ts` | `cleanupUploads` | Second tombstone pass for inputs whose jobs have all finished |
| `cloud/src/uploads.ts` | `reserveUpload` | Reword the `input_capacity` message |
| `cloud/tests/uploads.test.ts` | new describe | The 32-run wedge, plus both retention guards |

## Do not modify

- `reserveUpload`'s ceilings or guard SQL
- `publicMedia`, `inputUrls`, `cloud/src/jobs.ts`
- `lib/account/client.ts`'s upload path

## Tasks

- [x] **1. Reproduce first.** A failing test that runs 32 references through
      finished jobs and asserts the 33rd reservation is refused, then freed by
      cleanup. Confirmed red for the right reason before any fix.
      Verify: `cd cloud && npx vitest run tests/uploads.test.ts`
- [x] **2. Guards, also written first.** A live job keeps its input; an
      unattached reservation keeps its expiry. Both passed against the unfixed
      code, so they pin behaviour the fix must not break.
- [x] **3. The pass.** Drop the expiry requirement for inputs no live job holds,
      qualified by `EXISTS` so a reservation in flight is untouched.
- [x] **4. Message.** Name waiting for jobs to finish, not a screen that does not exist.
- [x] **5. Full check.** `cd cloud && npx vitest run` (152) and, at the root,
      `npx vitest run` (1700), `npx tsc --noEmit` in both.
- [x] **6. Smoke test** on port 3117 / worker 8817, against the real Worker and D1.

## Deployment

`cd cloud && npx wrangler deploy` after merge. Vercel will ship the message-free
half automatically; the Worker will not go out on its own.
