"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { deleteRole } from "./actions";

export default function RoleDeleteButton({
  roleId,
  roleName,
}: {
  roleId: string;
  roleName: string;
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
      const result = await deleteRole(roleId);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      window.location.assign("/roles?deleted=1");
    });
  }

  return (
    <>
      <button
        className="act-del"
        type="button"
        aria-label={`Delete ${roleName}`}
        title="Delete"
        disabled={isPending}
        onClick={() => {
          setError("");
          setConfirmOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </button>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`role-delete-title-${dialogId}`}
        aria-describedby={`role-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget && !isPending) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon"><AlertTriangle aria-hidden="true" /></span>
          <h2 className="gg-card-title" id={`role-delete-title-${dialogId}`}>Delete role?</h2>
        </div>
        <div className="gg-modal-body">
          <p id={`role-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{roleName}</strong>? Roles assigned to users cannot be deleted.
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
          <button className="gg-btn gg-btn--danger" type="button" onClick={handleDelete} disabled={isPending}>
            <Trash2 aria-hidden="true" />
            {isPending ? "Deleting..." : "Delete Role"}
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
