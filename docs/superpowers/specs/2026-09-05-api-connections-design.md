# Unified API connections

Status: Approved design
Date: 2026-09-05

## Context

The connections dialog grew a second storage system when accounts arrived, and
the two were stacked rather than merged. `ApiKeyConfig` renders
`AccountConnections` at the top — a provider `<select>`, one key field, one Save
button, and a list of what the account holds — then a heading reading
"Browser-only connections", then the grid of provider cards. A signed-in user
faces two places to put a Gemini key and no stated reason to prefer either.

The two systems are genuinely different, which is why the split happened:

| | Browser keys | Account connections |
| --- | --- | --- |
| Stored | `localStorage` via `useAppStore` | D1, AES-GCM, `account_connections` |
| Shape | One field per provider (`apiKey`, `kieApiKey`, `cfToken` + `cfAccountId`, …) | `{provider, apiKey, accountId?}` |
| Readable back | Yes | Never — only `hint`, the last four characters |
| Used by | Browser-only generation | Cloud jobs (`jobs.ts` resolves `account_connections`) |
| Saved when | Save & close, or as-you-type for Cloudflare and the aggregators | Its own form's Save button |

The plumbing to unify them already exists. `lib/account/key-import.ts` has
`importBrowserKey()` and `browserKeyCandidates()`, which maps every app-store key
field to a provider. `POST /api/account/connections` without `ifAbsent`
overwrites and bumps `revision`; `DELETE /api/account/connections/:provider`
removes. Nothing new is needed on the Worker.

## Goals

- One card per provider. Storage is a property of the card, not a section you
  belong to.
- Signing in and pasting a key is enough to run a cloud job. No second gesture,
  no button to discover.
- A key saved from another device is legible on this one.
- The same UI manages connections on the account page.

## Non-goals

- **Changing workspace gating.** A provider saved only to the account still
  reads as not connected in a browser-only workspace, because browser-only
  genuinely cannot run it. `tests/connection-gate-parity.test.tsx` passes
  unchanged.
- **Removing `AccountKeyImport`.** The "Provider keys" tab in the browser import
  dialog becomes a fallback rather than the main path, but it still serves
  first-sign-in migration. Removing it is a separate decision.
- **Returning saved keys to the browser.** The vault stays write-only. This is
  what forces the copy semantics below.

## Design

### Storage semantics: copy, not move

A key saved to the account **also stays on the device**. The alternative —
moving it — was rejected because the vault never returns a key, so a moved key
would silently disable browser-only generation for that provider.

The cost accepted: the interface cannot claim a key lives in exactly one place.
It says where the key is, which may be two places.

### The default: both, on Save & close

Signed in, **Save & close** writes every changed key to the account. Dismissing
the dialog — the X, the backdrop, Escape — syncs nothing, matching how those
already discard unsaved input. Cloud
jobs work the moment a key is pasted. The earlier design made this a second
press on a per-provider button; that reintroduced the discovery problem the work
set out to remove, and made the signed-in path *worse* than today's dedicated
form, which writes straight to the server in one gesture.

Save & close is the sync point for **all** providers, including Cloudflare and
the aggregators that otherwise save to the store as you type. Per-keystroke
uploads are not acceptable, and one rule is easier to explain than two. The
consequence for those providers: typing a token and then dismissing leaves it on
the device but not in the account, until the next Save & close picks it up.

A key that fails validation is not uploaded. Gemini, Kie and fal validate on
Save & close; only a key that passes is synced.

### The revision guard

Sync writes a provider **only when the local key's last four characters differ
from the stored `hint`**. Without the check, every close bumps `revision`, and
`resolveConnection` throws on a stale revision
(`cloud/src/provider-adapters/queued.ts:14`,
`cloud/src/provider-adapters/synchronous.ts:31`), failing any job still running
on the old one into `needs_attention`.

`hint` is `apiKey.slice(-4)` (`cloud/src/vault.ts:40`), already returned by the
connections list and the session payload. No new endpoint.

**Known limitation: a Cloudflare account-ID-only change never syncs.** The
guard compares `hint`, which is `cfToken.slice(-4)` — the account ID plays no
part in it. Editing only the Account ID field and leaving the token as it was
leaves `hint` unchanged, so `pendingConnectionWrites` sees nothing to sync and
Save & close silently keeps the account's old account ID. This is accepted as
a known limitation rather than special-cased: recovery is to press "Remove
from account" and then "Save to account" again, which re-sends both fields
unconditionally.

### The opt-out flag

"Remove from account" must survive the next Save & close, or removing a
connection becomes a loop. One persisted per-provider list in `useAppStore`
records the providers deliberately kept out; sync skips them. Pressing "Save to
account" clears the flag for that provider.

This flag is the only way to reach the local-only state once signed in.

### Card states

Signed out, no badge and no button render — the dialog is exactly what it is
today. Signed in:

| Device | Account | Badge | Button |
| --- | --- | --- | --- |
| — | — | nothing | none |
| yes | yes | On this device · Encrypted in your account | Remove from account |
| yes | — | On this device · Not in your account | Save to account |
| — | yes | Encrypted in your account · ends ··9c1d, plus a line noting browser-only runs need a key here | Remove from account |

Row two is the default. Row three is reachable only through the opt-out flag.
Row four is the cross-device case: signed in on a second machine, the card knows
the account holds a key instead of looking untouched.

A diverged state does not exist. It cannot persist when every close syncs.

If a sync fails, the card shows the failure and offers a retry; the local key is
unaffected.

### Components

`ConnectionStorageControl` (new, `components/account/`) takes
`{provider, apiKey, accountId?}` and renders the badge and button. It owns its
busy and error state, the POST and DELETE calls, and the removal confirm. One
interface, testable alone.

`ApiKeyConfig` drops the embedded `AccountConnections` block and the
"Browser-only connections" heading. `ProviderCard` gains a slot for the control.
The close handler gains the sync pass. Footer copy collapses to one sentence,
which is the disclosure that makes saving-without-asking fair: *"Signed in, so
your keys are kept on this device and encrypted in your account, where cloud
jobs can use them."*

`AccountConnections` loses its `panel` variant, its form, its provider select
and its modal. The `rail` variant survives as a read-only summary — provider and
`··hint` — with one **Manage connections** button that opens `ApiKeyConfig`.
Deletion stays reachable from the card that owns it.

`AccountConsole` holds that dialog's open state.

### Account page

The rail is 300px, so the provider grid cannot live in it. The rail's button
opens the same dialog the workspace opens — literally the same component, so the
two surfaces cannot drift. This replaces the one-key-at-a-time form.

### Testing

Unit tests for `ConnectionStorageControl` across the four states and the save,
remove and retry actions. A test that the sync pass skips a provider whose hint
matches, skips an opted-out provider, and skips a key that failed validation.
No existing test needs rewriting: `tests/account/account-page.test.tsx` mocks
`AccountConnections` wholesale (`default: () => <section>Saved connections</section>`)
and asserts only that label, which the rail keeps. Confirm this still passes
rather than assuming it.

## Scope and implementation boundary

Lives in: `components/account/ConnectionStorageControl.tsx` (new),
`components/ApiKeyConfig.tsx`, `components/account/AccountConnections.tsx`,
`components/account/AccountConsole.tsx`, and `store/useAppStore.ts` for the
opt-out list.

Must not touch: the Worker (`cloud/`) at all; `lib/account/key-import.ts` beyond
reuse; workspace connection gating; job submission, polling or state; the
gallery; `MicroAiUsagePanel` and the shared fast tier block.

Visual reference: `design-explorations/api-connections.reference.html`.
