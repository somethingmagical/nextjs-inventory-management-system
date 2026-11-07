"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Eye, Info, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteSaleReturn } from "@/app/(authenticated)/sales/returns/create/actions";

export default function SaleReturnRowActions({
  returnId,
  reference,
}: {
  returnId: string;
  reference: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    closeMenu();
    if (!window.confirm(
      `Delete ${reference}? The returned quantities will be removed from warehouse stock. The sale return will be retained as a deleted record.`,
    )) {
      return;
    }

    setError("");
    startDelete(async () => {
      const result = await deleteSaleReturn(returnId);
      if (result.status === "error") setError(result.message);
    });
  }

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

  const basePath = `/sales/returns/${encodeURIComponent(returnId)}`;

  return (
    <div className="purchase-action-cell" ref={containerRef}>
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
          <Link className="gg-menu-item" href={basePath} role="menuitem" onClick={closeMenu}>
            <Eye aria-hidden="true" />
            View Sale Return
          </Link>
          <Link className="gg-menu-item" href={`${basePath}/pdf`} role="menuitem" onClick={closeMenu}>
            <Download aria-hidden="true" />
            Download PDF
          </Link>
          <Link className="gg-menu-item" href={`${basePath}/edit`} role="menuitem" onClick={closeMenu}>
            <Pencil aria-hidden="true" />
            Edit Sale Return
          </Link>
          <button
            className="gg-menu-item is-danger"
            type="button"
            role="menuitem"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? "Deleting Sale Return..." : "Delete Sale Return"}
          </button>
        </div>
      )}
      {error && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
