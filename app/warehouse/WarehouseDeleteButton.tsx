"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { deleteWarehouse } from "./actions";
import {
  initialWarehouseActionState,
  type WarehouseActionState,
} from "./create/action-state";

export default function WarehouseDeleteButton({
  warehouseId,
  warehouseName,
}: {
  warehouseId: string;
  warehouseName: string;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const deleteAction = deleteWarehouse.bind(null, warehouseId);
  const [state, formAction, isPending] = useActionState<WarehouseActionState, FormData>(
    deleteAction,
    initialWarehouseActionState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [confirmOpen]);

  useEffect(() => {
    if (state.status !== "error") {
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
  }, [state]);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={() => {
          dialogRef.current?.close();
        }}
      >
        <button
          className="act-del"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label={`Delete ${warehouseName}`}
          title="Delete"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </form>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`warehouse-delete-title-${dialogId}`}
        aria-describedby={`warehouse-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dialogRef.current?.close();
          }
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h2 className="gg-card-title" id={`warehouse-delete-title-${dialogId}`}>Delete warehouse?</h2>
        </div>
        <div className="gg-modal-body">
          <p id={`warehouse-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{warehouseName}</strong>? This warehouse will be moved to
            deleted records and will no longer appear in the active warehouse list.
          </p>
        </div>
        <div className="gg-modal-foot">
          <button
            className="gg-btn gg-btn--secondary"
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={isPending}
            autoFocus
          >
            Cancel
          </button>
          <button
            className="gg-btn gg-btn--danger"
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={isPending}
          >
            <Trash2 aria-hidden="true" />
            {isPending ? "Deleting..." : "Delete Warehouse"}
          </button>
        </div>
      </dialog>
      {state.status === "error" && showToast && (
        <p
          className={`warehouse-toast${toastVisible ? " is-visible" : ""}`}
          role="alert"
          aria-hidden={!toastVisible}
        >
          <Info size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
    </>
  );
}
