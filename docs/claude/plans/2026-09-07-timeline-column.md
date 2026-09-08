# Plan — Timeline column width

Spec: `docs/claude/specs/2026-09-07-timeline-column-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `app/page.tsx` | `columnWidth`, applied to the header row and `<main>` |
| `components/TimelineWorkspace.tsx` | Root cap 1400px → `max-w-[110rem]` |
| `tests/timeline/page-width.test.tsx` | Timeline gets the wide column; video and image do not |

## Do not modify

- `components/account/AccountPageShell.tsx` — the width being matched
- The 1400px column in the four generation workspaces
- The footer, and the padding scale on either page

## Tasks

- [x] **1. Find both caps.** Page `max-w-7xl` binds first; the workspace's own
      1400px never applied.
- [x] **2. `columnWidth`** in `app/page.tsx`, on the header row and `<main>`.
- [x] **3. Raise** the workspace cap to `max-w-[110rem]` so it stops binding.
- [x] **4. Test** — wide for timeline (header included), studio column for
      video and image. Fails against `HEAD`.
- [x] **5. Full check.** vitest 1826, tsc, eslint, next build — all exit 0.
- [x] **6. Smoke test** on port 3133. At 1920px: timeline `<main>` and header
      both 1760px (= 110rem) at the same left edge; video stays 1280px
      (`max-w-7xl`); switching workspace in-app widens cleanly with no
      horizontal overflow; at 390px nothing overflows.
