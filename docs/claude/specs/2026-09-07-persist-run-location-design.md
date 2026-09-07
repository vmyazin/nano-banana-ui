# Run location survives a remount

Status: Approved design
Date: 2026-09-07

## Context

Issue 05: "each return to a mode reverted to *Runs in the background*, and the
model selection reset with it. Roughly ten re-selections across one short job."

The run-location half is exact. `useCloudWorkspace` held the choice in two
component-local flags:

```ts
const [guestOverride,setGuestOverride]=useState(false);
const [browserOwner,setBrowserOwner]=useState<string|null>(null);
const cloud = signedIn && browserOwner!==owner || uncertain && !guestOverride;
```

Switching engine, switching input mode, and leaving a feature and coming back
all remount the workspace that owns that hook. Every remount reinitialised both
flags, so `cloud` computed back to `true` and the user paid the switch again.

The model half does **not** hold as written, and is deliberately not addressed
here. `engine` and every per-provider model (`kieImageModel`,
`runwareImageModel`, …) are already in `useAppStore`'s `partialize` allowlist,
so they persist to localStorage; all four model write-backs sit inside
`onChange` handlers, so nothing overwrites a choice on a mode switch; and
`availableEngines` is filtered by feature only, never by run location, so
flipping in-browser/background cannot change the engine or its model. Fixing a
defect that cannot be reproduced would mean inventing one.

## Goals

- The run location chosen for an engine survives the remounts that switching
  engine or input mode causes.
- Behaviour is otherwise identical, including the owner scoping that the
  `browserOwner!==owner` comparison provided.

## Non-goals

- **The model half**, for the reason above. Two nearby defects were found while
  looking and are recorded rather than fixed, because neither is what was
  reported:
  - `ProviderVideoWorkspace.tsx:181-185` filters models by input mode and falls
    back to `models[0]`, so a remembered model that cannot run in the new mode
    displays as a different one. Real, but "this model does not support this
    mode", not a persistence gap.
  - `valuesByModel` in the same file is also `useState`, so a model's control
    values reset on remount — though `carryOverValues` refills them from the
    draft store, which blunts it.
- No persistence to disk. "Per session" is the report's own wording.
- No change to how a job is submitted, or to the account/epoch guards.

## Design

A small session-scoped store, `store/useRunLocationStore.ts`, keyed by
`${ownerId ?? 'guest'}:${provider}`. A store rather than `useState` so it
outlives a remount; deliberately unpersisted so a reload starts from the account
default rather than resurrecting a choice made under conditions that may no
longer hold.

Keying by owner preserves what the old comparison was for: choosing to run *this
account's* work in the browser says nothing about the next account to sign in.

The four-case boolean reduces exactly:

| signed in | uncertain | chose browser | old | new |
| --- | --- | --- | --- | --- |
| yes | no | no | true | true |
| yes | no | yes | false | false |
| no | yes | no | true | true |
| no | yes | yes | false | false |
| no | no | – | false | false |

so `cloud = (signedIn || uncertain) && !choseBrowser`, and `checking` follows the
same flag.

## Scope and implementation boundary

Lives in `store/useRunLocationStore.ts` (new) and `lib/account/useCloudWorkspace.ts`.

Must not modify: `store/useAppStore.ts` (engine and model preferences already
persist correctly), `store/useAccountStore.ts`, any workspace component, or the
submission path inside `perform`.

## Acceptance

- Choosing the browser, then remounting the workspace, leaves the choice intact.
- A different account signing in does not inherit it.
- A signed-out session with unknown account state can still opt out.
- Every existing account execution/isolation test passes unchanged.
