"use client";

import { useState, useTransition } from "react";
import { Info, Trash2 } from "lucide-react";
import { deleteAdjustment } from "./actions";

export default function AdjustmentDeleteButton({
  adjustmentId,
  reference,
}: {
  adjustmentId: string;
  reference: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    if (!window.confirm(
      `Delete ${reference}? Its stock changes will be reversed. If the stock has since been used, deletion may be rejected.`,
    )) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteAdjustment(adjustmentId);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <>
      <button
        className="act-del"
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Delete ${reference}`}
        title="Delete"
      >
        <Trash2 aria-hidden="true" />
      </button>
      {error && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}
