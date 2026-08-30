# Dialog scroll locking and mobile accessibility

Status: Approved design

## Context

The app has three dialog-like overlays: the library, API connections, and the image lightbox. Their keyboard and focus behavior differs, none consistently locks page scrolling, and the lightbox is not exposed as a modal dialog. On narrow touch screens the two content-heavy dialogs remain centered instead of anchoring as sheets, while several dialog controls are smaller than a reliable touch target.

## Goals

- Disable document scrolling while any dialog is open without disabling the dialog's own content scrolling.
- Preserve scroll locking when dialogs are nested or overlap during exit animations.
- Give every dialog Escape dismissal, initial focus, a Tab/Shift+Tab focus trap, and focus restoration.
- Expose each surface with an accessible dialog name and `aria-modal` semantics.
- Make content-heavy dialogs usable as bottom sheets on narrow viewports with safe-area padding and contained scrolling.
- Provide at least 48px touch targets for dialog buttons, inputs, and selects on mobile.

## Non-goals

- Do not change dialog content, provider settings, library behavior, or image download behavior.
- Do not introduce swipe-to-dismiss; keyboard, close button, and backdrop dismissal remain the supported methods.
- Do not redesign desktop dialog dimensions or density.
- Do not add a third-party dialog dependency.

## Scope and implementation boundary

Shared behavior lives in `hooks/useAccessibleDialog.ts`. It owns a stack of active dialogs, a reference-counted document scroll lock, Escape handling for only the topmost dialog, Tab containment, and restoration to the element that opened the dialog.

`components/LibraryOverlay.tsx`, `components/ApiKeyConfig.tsx`, and `components/ImageLightbox.tsx` adopt the hook and expose their existing visible titles/descriptions through ARIA. Mobile-only dialog sheet, safe-area, overscroll, and touch-target rules live in `app/globals.css`.

The change must not touch workspace generation components, stores, routes, or provider adapters.

## Acceptance criteria

- `html` and `body` cannot scroll while at least one dialog is open and their prior inline styles are restored after the last dialog closes.
- Only the topmost nested dialog handles Escape and focus containment.
- Tab and Shift+Tab wrap inside each open dialog.
- Closing restores focus to the connected opener.
- All three overlays have `role="dialog"`, `aria-modal="true"`, and an accessible name.
- Library and API connections use mobile bottom-sheet placement, `90dvh` maximum height, internal overscroll containment, safe-area padding, and 48px interactive controls.
- Desktop presentation remains centered and unchanged in width.

