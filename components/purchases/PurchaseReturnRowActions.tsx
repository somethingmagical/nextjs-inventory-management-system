"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Download, Eye, Info, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deletePurchaseReturn } from "@/app/(authenticated)/purchases/returns/actions";
import { initialPurchaseReturnCreateActionState } from "@/app/(authenticated)/purchases/returns/create/action-state";

export default function PurchaseReturnRowActions({
  returnId,
  reference,
}: {
  returnId: string;
  reference: string;
}) {
  const dialogId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePurchaseReturn,
    initialPurchaseReturnCreateActionState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

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

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDeleting) {
      event.preventDefault();
      return;
    }

    dialogRef.current?.close();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
  }, [confirmOpen]);

  useEffect(() => {
    if (deleteState.status !== "error") {
      setShowToast(false);
      setToastVisible(false);
      return;
    }

    setShowToast(true);
    setToastVisible(true);
    const hideTimeout = window.setTimeout(() => setToastVisible(false), 5000);
    const removeTimeout = window.setTimeout(() => setShowToast(false), 5300);
    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, [deleteState]);

  const basePath = `/purchases/returns/${encodeURIComponent(returnId)}`;

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
          <Link className="gg-menu-item" href={basePath} role="menuitem" onClick={closeMenu}>
            <Eye aria-hidden="true" />
            View Purchase Return
          </Link>
          <Link className="gg-menu-item" href={`${basePath}/pdf`} role="menuitem" onClick={closeMenu}>
            <Download aria-hidden="true" />
            Download PDF
          </Link>
          <Link className="gg-menu-item" href={`${basePath}/edit`} role="menuitem" onClick={closeMenu}>
            <Pencil aria-hidden="true" />
            Edit Purchase Return
          </Link>
          <div>
            <button
              className="gg-menu-item is-danger"
              type="button"
              role="menuitem"
              disabled={isDeleting}
              onClick={() => {
                closeMenu();
                setConfirmOpen(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete Purchase Return
            </button>
          </div>
        </div>
      )}
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`purchase-return-delete-title-${dialogId}`}
        aria-describedby={`purchase-return-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h2 className="gg-card-title" id={`purchase-return-delete-title-${dialogId}`}>
            Delete purchase return?
          </h2>
        </div>
        <div className="gg-modal-body">
          <p id={`purchase-return-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{reference}</strong>? Its stock movement will be reversed,
            adding the returned quantity back to the warehouse.
          </p>
        </div>
        <form action={deleteAction} onSubmit={handleDeleteSubmit}>
          <input type="hidden" name="returnId" value={returnId} />
          <div className="gg-modal-foot">
            <button
              className="gg-btn gg-btn--secondary"
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={isDeleting}
              autoFocus
            >
              Cancel
            </button>
            <button className="gg-btn gg-btn--danger" type="submit" disabled={isDeleting}>
              <Trash2 aria-hidden="true" />
              {isDeleting ? "Deleting..." : "Delete Purchase Return"}
            </button>
          </div>
        </form>
      </dialog>
      {deleteState.status === "error" && showToast && (
        <p
          className={`warehouse-toast${toastVisible ? " is-visible" : ""}`}
          role="alert"
          aria-hidden={!toastVisible}
        >
          <Info size={18} aria-hidden="true" />
          <span>{deleteState.message}</span>
        </p>
      )}
    </div>
  );
}
