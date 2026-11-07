"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { deleteUser } from "./actions";
import { initialUserActionState, type UserActionState } from "./create/action-state";

export default function UserDeleteButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState(initialUserActionState);
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setState(initialUserActionState);
    dialogRef.current?.close();
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.status === "success") {
        window.location.assign("/users?deleted=1");
        return;
      }
      setState(result);
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
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
      <form ref={formRef} onSubmit={handleSubmit}>
        <button
          className="act-del"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label={`Delete ${userName}`}
          title="Delete"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </form>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`user-delete-title-${dialogId}`}
        aria-describedby={`user-delete-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon"><AlertTriangle aria-hidden="true" /></span>
          <h2 className="gg-card-title" id={`user-delete-title-${dialogId}`}>Delete user?</h2>
        </div>
        <div className="gg-modal-body">
          <p id={`user-delete-description-${dialogId}`}>
            Are you sure you want to delete <strong>{userName}</strong>? This account will be moved to deleted
            records and will no longer be able to access the system.
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
            {isPending ? "Deleting..." : "Delete User"}
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
