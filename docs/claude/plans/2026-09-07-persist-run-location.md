# Plan — run location survives a remount

Spec: `docs/claude/specs/2026-09-07-persist-run-location-design.md`
Date: 2026-09-07

## File map

| Path | Target | Change |
| --- | --- | --- |
| `store/useRunLocationStore.ts` | new | Session-scoped choice, keyed owner + engine |
| `lib/account/useCloudWorkspace.ts` | `13:26`, `62:64` | Read the store instead of two useState flags |
| `tests/account/run-location.test.tsx` | new | Remount, owner scoping, signed-out opt-out |

## Do not modify

- `store/useAppStore.ts` — engine and model preferences already persist
- `store/useAccountStore.ts`
- Any workspace component
- `perform()` inside `useCloudWorkspace`, and its account/epoch guards

## Tasks

- [x] **1. Store.** `choices` keyed `${ownerId ?? 'guest'}:${provider}`, `choose`,
      `reset`. Unpersisted. Verify: `npx tsc --noEmit`
- [x] **2. Hook.** Replace the flags; collapse the boolean to
      `(signedIn || uncertain) && !choseBrowser` per the spec's table; route
      `useBrowser`/`useCloud` through `choose`.
      Verify: `npx vitest run tests/account/execution.test.tsx`
- [x] **3. Test the actual defect.** The remount case must fail against the old
      hook — confirmed by reverting the file and re-running before keeping it.
      Verify: `npx vitest run tests/account/run-location.test.tsx`
- [x] **4. Full check.** `npx vitest run && npx tsc --noEmit && npx eslint … && npx next build`
- [x] **5. Smoke test** on port 3109 / worker 8809, then hand over the link.
