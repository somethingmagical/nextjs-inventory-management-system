"use client";

import { useEffect, type RefObject } from "react";

export default function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  isOpen = true,
) {
  useEffect(() => {
    const activeDialog = dialogRef.current;
    if (!isOpen || !activeDialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const getFocusableElements = () => Array.from(
      activeDialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

    (getFocusableElements()[0] ?? activeDialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        activeDialog?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    activeDialog.addEventListener("keydown", handleKeyDown);
    return () => {
      activeDialog.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [dialogRef, isOpen]);
}
