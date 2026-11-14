"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Eye, Info, Pencil, Trash2 } from "lucide-react";
import { deleteTransfer } from "@/app/(authenticated)/transfers/create/actions";
import { initialTransferCreateActionState } from "@/app/(authenticated)/transfers/create/action-state";
import TableRowActionsMenu from "@/components/shared/TableRowActionsMenu";

export default function TransferRowActions({
  transferId,
  reference,
  canManage,
}: {
  transferId: string;
  reference: string;
  canManage: boolean;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteTransfer,
    initialTransferCreateActionState,
  );
  const basePath = `/transfers/${encodeURIComponent(transferId)}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
  }, [confirmOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDeleting) event.preventDefault();
  }

  return (
    <div className="transfer-row-actions">
      <TableRowActionsMenu label={reference}>
        <Link
          className="gg-menu-item"
          href={basePath}
          role="menuitem"
        >
          <Eye aria-hidden="true" />
          View Transfer
        </Link>
        {canManage && (
          <Link className="gg-menu-item" href={`${basePath}/edit`} role="menuitem">
            <Pencil aria-hidden="true" />
            Edit Transfer
          </Link>
        )}
        {canManage && (
          <button
            className="gg-menu-item is-danger"
            type="button"
            role="menuitem"
            disabled={isDeleting}
            data-close-row-menu=""
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete Transfer
          </button>
        )}
      </TableRowActionsMenu>
      {deleteState.status === "error" && !confirmOpen && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{deleteState.message}</span>
        </p>
      )}
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`transfer-delete-title-${dialogId}`}
        aria-describedby={`transfer-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h2 className="gg-card-title" id={`transfer-delete-title-${dialogId}`}>
            Delete transfer?
          </h2>
        </div>
        <div className="gg-modal-body">
          <p id={`transfer-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{reference}</strong>? This reverses its stock movement:
            completed quantities return to the source warehouse and are removed from the destination.
            Sent quantities return to the source only. If the destination no longer has enough stock,
            deletion will be blocked.
          </p>
          {deleteState.status === "error" && (
            <p className="warehouse-field-error" role="alert">{deleteState.message}</p>
          )}
        </div>
        <form action={deleteAction} onSubmit={handleSubmit}>
          <input type="hidden" name="transferId" value={transferId} />
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
              {isDeleting ? "Deleting..." : "Delete Transfer"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
