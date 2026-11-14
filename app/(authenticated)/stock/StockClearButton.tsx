"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { clearWarehouseStock } from "./actions";

export default function StockClearButton({
  productId,
  productName,
  warehouseId,
  warehouseName,
  quantity,
}: {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: string;
}) {
  const router = useRouter();
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setErrorMessage("");
    dialogRef.current?.close();
    startTransition(async () => {
      const result = await clearWarehouseStock(productId, warehouseId, quantity);
      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }

      const notice = result.changed ? "cleared=1" : "alreadyZero=1";
      router.push(`/stock?warehouseId=${encodeURIComponent(warehouseId)}&${notice}`);
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
  }, [confirmOpen]);

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit}>
        <button
          className="act-del"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label={`Set ${productName} stock to zero in ${warehouseName}`}
          title="Set stock to zero"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </form>
      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={dialogRef}
        aria-labelledby={`stock-clear-title-${dialogId}`}
        aria-describedby={`stock-clear-description-${dialogId}`}
        onClose={() => setConfirmOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h2 className="gg-card-title" id={`stock-clear-title-${dialogId}`}>
            Set warehouse stock to zero?
          </h2>
        </div>
        <div className="gg-modal-body">
          <p id={`stock-clear-description-${dialogId}`}>
            Set <strong>{productName}</strong> in <strong>{warehouseName}</strong> to zero?
            This will record an inventory adjustment. The product and its stock at other
            warehouses will not be changed.
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
            {isPending ? "Updating..." : "Set quantity to zero"}
          </button>
        </div>
      </dialog>
      {errorMessage && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{errorMessage}</span>
        </p>
      )}
    </>
  );
}
