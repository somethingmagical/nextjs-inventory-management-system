"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CornerUpRight,
  DollarSign,
  Download,
  Eye,
  Info,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { deleteSale } from "@/app/(authenticated)/sales/create/actions";

export default function SaleRowActions({
  saleId,
  reference,
}: {
  saleId: string;
  reference: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    closeMenu();
    if (!window.confirm(
      `Delete ${reference}? The sold quantities will be returned to the warehouse. Existing payment history will be retained.`,
    )) {
      return;
    }

    setError("");
    startDelete(async () => {
      const result = await deleteSale(saleId);
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
          <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}`} role="menuitem" onClick={closeMenu}>
            <Eye aria-hidden="true" />
            View Sale
          </Link>
          <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/pdf`} role="menuitem" onClick={closeMenu}>
            <Download aria-hidden="true" />
            Download PDF
          </Link>
          <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/payments`} role="menuitem" onClick={closeMenu}>
            <DollarSign aria-hidden="true" />
            Show Payments
          </Link>
          <Link className="gg-menu-item" href={`/sales/returns/create?saleId=${encodeURIComponent(saleId)}`} role="menuitem" onClick={closeMenu}>
            <CornerUpRight aria-hidden="true" />
            Create Sale Return
          </Link>
          <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/edit`} role="menuitem" onClick={closeMenu}>
            <Pencil aria-hidden="true" />
            Edit Sale
          </Link>
          <button
            className="gg-menu-item is-danger"
            type="button"
            role="menuitem"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? "Deleting Sale..." : "Delete Sale"}
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
