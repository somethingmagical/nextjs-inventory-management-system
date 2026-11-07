"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, MoreVertical, Pencil, Trash2, Eye } from "lucide-react";

export default function PurchaseRowActions({
  purchaseId,
  reference,
}: {
  purchaseId: string;
  reference: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div className={`purchase-action-cell${isOpen ? " is-open" : ""}`} ref={containerRef}>
      <button
        className="gg-row-action purchase-action-toggle"
        type="button"
        aria-label={`Actions for ${reference}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreVertical aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="gg-menu purchase-action-menu" role="menu" aria-label={`${reference} actions`}>
          <Link
            className="gg-menu-item"
            href={`/purchases/${encodeURIComponent(purchaseId)}`}
            role="menuitem"
            onClick={closeMenu}
          >
            <Eye aria-hidden="true" />
            View Purchase
          </Link>
          <Link
            className="gg-menu-item"
            href={`/purchases/${encodeURIComponent(purchaseId)}/pdf`}
            role="menuitem"
            onClick={closeMenu}
          >
            <Download aria-hidden="true" />
            Download PDF
          </Link>
          <Link
            className="gg-menu-item"
            href={`/purchases/${encodeURIComponent(purchaseId)}/edit`}
            role="menuitem"
            onClick={closeMenu}
          >
            <Pencil aria-hidden="true" />
            Edit Purchase
          </Link>
          <button
            className="gg-menu-item is-danger"
            type="button"
            role="menuitem"
            disabled
            title="Delete will be available in the delete step."
          >
            <Trash2 aria-hidden="true" />
            Delete Purchase
          </button>
        </div>
      )}
    </div>
  );
}
