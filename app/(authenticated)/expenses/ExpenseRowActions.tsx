"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AlertTriangle, Info, Pencil, Trash2 } from "lucide-react";
import { deleteExpense } from "./actions";

export default function ExpenseRowActions({
  expenseId,
  title,
}: {
  expenseId: string;
  title: string;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
  }, [confirmOpen]);

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteExpense(expenseId);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <>
      <div className="row-acts">
        <Link
          className="act-edit"
          href={`/expenses/${encodeURIComponent(expenseId)}/edit`}
          aria-label={`Edit ${title}`}
          title="Edit expense"
        >
          <Pencil aria-hidden="true" />
        </Link>
        <button
          className="act-del"
          type="button"
          aria-label={`Delete ${title}`}
          title="Delete expense"
          disabled={isPending}
          onClick={() => {
            setError("");
            setConfirmOpen(true);
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`expense-delete-title-${dialogId}`}
        aria-describedby={`expense-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget && !isPending) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h2 className="gg-card-title" id={`expense-delete-title-${dialogId}`}>
            Delete expense?
          </h2>
        </div>
        <div className="gg-modal-body">
          <p id={`expense-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{title}</strong>? This expense will be moved to deleted records.
          </p>
          {error && <p className="warehouse-field-error" role="alert">{error}</p>}
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
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 aria-hidden="true" />
            {isPending ? "Deleting..." : "Delete Expense"}
          </button>
        </div>
      </dialog>
      {error && !confirmOpen && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}
