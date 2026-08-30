'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogStack: symbol[] = [];
let scrollLockDepth = 0;
let scrollStyles: {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyOverscroll: string;
  bodyPaddingRight: string;
} | null = null;

function acquireScrollLock() {
  scrollLockDepth += 1;
  if (scrollLockDepth !== 1) return;

  const html = document.documentElement;
  const body = document.body;
  scrollStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscroll: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
  };

  const scrollbarGap = html.clientWidth > 0 ? window.innerWidth - html.clientWidth : 0;
  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
  if (scrollbarGap > 0) {
    body.style.paddingRight = scrollStyles.bodyPaddingRight
      ? `calc(${scrollStyles.bodyPaddingRight} + ${scrollbarGap}px)`
      : `${scrollbarGap}px`;
  }
}

function releaseScrollLock() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth !== 0 || !scrollStyles) return;

  document.documentElement.style.overflow = scrollStyles.htmlOverflow;
  document.documentElement.style.overscrollBehavior = scrollStyles.htmlOverscroll;
  document.body.style.overflow = scrollStyles.bodyOverflow;
  document.body.style.overscrollBehavior = scrollStyles.bodyOverscroll;
  document.body.style.paddingRight = scrollStyles.bodyPaddingRight;
  scrollStyles = null;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0
      && !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && !element.closest('[hidden]')
  );
}

function focusWithoutScrolling(element: HTMLElement) {
  element.focus({ preventScroll: true });
}

export function useAccessibleDialog({
  open,
  onClose,
  dialogRef,
}: {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const token = Symbol('dialog');
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogStack.push(token);
    acquireScrollLock();

    const dialog = dialogRef.current;
    if (dialog) focusWithoutScrolling(dialog);

    const isTopmost = () => dialogStack.at(-1) === token;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      const currentDialog = dialogRef.current;
      if (!currentDialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(currentDialog);
      if (focusable.length === 0) {
        event.preventDefault();
        focusWithoutScrolling(currentDialog);
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusIsOutside = !(active instanceof Node) || !currentDialog.contains(active);

      if (event.shiftKey && (active === first || active === currentDialog || focusIsOutside)) {
        event.preventDefault();
        focusWithoutScrolling(last);
      } else if (!event.shiftKey && (active === last || active === currentDialog || focusIsOutside)) {
        event.preventDefault();
        focusWithoutScrolling(first);
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isTopmost()) return;
      const currentDialog = dialogRef.current;
      if (!currentDialog || currentDialog.contains(event.target as Node)) return;
      focusWithoutScrolling(currentDialog);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      const stackIndex = dialogStack.lastIndexOf(token);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);
      releaseScrollLock();
      if (returnFocus?.isConnected) focusWithoutScrolling(returnFocus);
    };
  }, [open, dialogRef]);
}
