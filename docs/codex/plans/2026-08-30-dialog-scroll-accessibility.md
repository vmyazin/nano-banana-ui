# Dialog scroll locking and mobile accessibility plan

## File map

- `hooks/useAccessibleDialog.ts` — stack-aware scroll lock, Escape, focus trap, and focus restoration.
- `components/LibraryOverlay.tsx:45-135` — shared hook and labelled mobile sheet.
- `components/ApiKeyConfig.tsx:215-510` — shared hook and labelled mobile sheet.
- `components/ImageLightbox.tsx:15-85` — modal semantics and shared focus behavior.
- `app/globals.css:145-175` — mobile sheet, safe-area, overscroll, and touch-target rules.
- `tests/dialog-accessibility.test.tsx` — hook behavior, nested locks, focus wrapping, and restoration.
- Existing dialog component tests — semantic integration assertions where appropriate.

## Do not modify

- Generation workspaces and model controls
- Provider/API routes and stores
- Gallery persistence and lightbox download logic
- Desktop card and workspace layout

## Tasks

- [x] Implement the shared stack-aware dialog behavior and document scroll lock.
- [x] Apply accessible naming, focus ownership, and Escape handling to all three dialogs.
- [x] Add mobile sheet, internal scroll, safe-area, and touch-target styling.
- [x] Add focused regression coverage for shared behavior and component semantics.
- [x] Run focused tests, full suite, lint, and production build.
- [x] Audit all dialogs at a narrow touch viewport and desktop viewport in the local browser.
- [ ] Present the localhost URL and wait for explicit sign-off before shipping.
