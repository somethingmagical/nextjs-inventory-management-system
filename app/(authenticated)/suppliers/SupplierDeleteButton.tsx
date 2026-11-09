"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { deleteSupplier } from "./actions";
import { initialSupplierActionState } from "./create/action-state";

export default function SupplierDeleteButton({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName: string;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, setState] = useState(initialSupplierActionState);
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setState(initialSupplierActionState);
    dialogRef.current?.close();
    startTransition(async () => {
      const result = await deleteSupplier(supplierId);
      if (result.status === "success") {
        router.push("/suppliers?deleted=1");
        return;
      }

      setState(result);
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [confirmOpen]);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/suppliers?deleted=1");
      return;
    }

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
  }, [router, state]);

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
      >
        <button
          className="act-del"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label={`Delete ${supplierName}`}
          title="Delete"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </form>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`supplier-delete-title-${dialogId}`}
        aria-describedby={`supplier-delete-description-${dialogId}`}
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
          <h2 className="gg-card-title" id={`supplier-delete-title-${dialogId}`}>Delete supplier?</h2>
        </div>
        <div className="gg-modal-body">
          <p id={`supplier-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{supplierName}</strong>? This supplier will be moved to
            deleted records and will no longer appear in the active supplier list.
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
            {isPending ? "Deleting..." : "Delete Supplier"}
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
