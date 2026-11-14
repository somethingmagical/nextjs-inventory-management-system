"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MouseEvent, ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { createPortal } from "react-dom";
import { TableRowActionsMenuContext } from "./TableRowActionsMenuContext";

export default function TableRowActionsMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const toggle = toggleRef.current;
      const menu = menuRef.current;
      if (!toggle || !menu) return;

      const toggleRect = toggle.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(
          toggleRect.right - 44 - menuRect.width,
          window.innerWidth - menuRect.width - 8,
        ),
      );
      let top = toggleRect.top + 6;
      if (top + menuRect.height > window.innerHeight - 8) {
        top = Math.max(8, toggleRect.bottom - menuRect.height - 6);
      }

      setMenuPosition({ top, right: window.innerWidth - left - menuRect.width });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
    toggleRef.current?.focus();
  }

  function handleMenuClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      target instanceof Element &&
      (target.closest("a[role='menuitem']") ||
        target.closest("[data-close-row-menu]"))
    ) {
      closeMenu();
    }
  }

  return (
    <>
      <div
        className={`table-row-action-cell${isOpen ? " is-open" : ""}`}
        ref={containerRef}
      >
        <button
          ref={toggleRef}
          className="gg-row-action table-row-action-toggle"
          type="button"
          aria-label={`Actions for ${label}`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <MoreVertical aria-hidden="true" />
        </button>
      </div>
      <TableRowActionsMenuContext.Provider value={closeMenu}>
        {isMounted &&
          createPortal(
            <div
              ref={menuRef}
              className="gg-menu table-row-action-menu"
              role="menu"
              aria-label={`${label} actions`}
              hidden={!isOpen}
              style={{ top: menuPosition.top, right: menuPosition.right }}
              onClick={handleMenuClick}
            >
              {children}
            </div>,
            document.body,
          )}
      </TableRowActionsMenuContext.Provider>
    </>
  );
}
