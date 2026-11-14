"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Download, Eye, Info, Pencil, Trash2 } from "lucide-react";
import TableRowActionsMenu from "@/components/shared/TableRowActionsMenu";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePurchaseReturn,
    initialPurchaseReturnCreateActionState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

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
    <div>
      <TableRowActionsMenu label={reference}>
        <Link className="gg-menu-item" href={basePath} role="menuitem">
          <Eye aria-hidden="true" />
          View Purchase Return
        </Link>
        <Link className="gg-menu-item" href={`${basePath}/pdf`} role="menuitem">
          <Download aria-hidden="true" />
          Download PDF
        </Link>
        <Link className="gg-menu-item" href={`${basePath}/edit`} role="menuitem">
          <Pencil aria-hidden="true" />
          Edit Purchase Return
        </Link>
        <button
          className="gg-menu-item is-danger"
          type="button"
          role="menuitem"
          disabled={isDeleting}
          data-close-row-menu=""
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 aria-hidden="true" />
          Delete Purchase Return
        </button>
      </TableRowActionsMenu>
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
