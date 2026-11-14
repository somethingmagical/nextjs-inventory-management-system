"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Download, Eye, Info, Pencil, Trash2 } from "lucide-react";
import { deleteSaleReturn } from "@/app/(authenticated)/sales/returns/create/actions";
import TableRowActionsMenu from "@/components/shared/TableRowActionsMenu";

export default function SaleReturnRowActions({
  returnId,
  reference,
}: {
  returnId: string;
  reference: string;
}) {
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    if (!window.confirm(
      `Delete ${reference}? The returned quantities will be removed from warehouse stock. The sale return will be retained as a deleted record.`,
    )) {
      return;
    }

    setError("");
    startDelete(async () => {
      const result = await deleteSaleReturn(returnId);
      if (result.status === "error") setError(result.message);
    });
  }

  const basePath = `/sales/returns/${encodeURIComponent(returnId)}`;

  return (
    <div>
      <TableRowActionsMenu label={reference}>
        <Link className="gg-menu-item" href={basePath} role="menuitem">
          <Eye aria-hidden="true" />
          View Sale Return
        </Link>
        <Link className="gg-menu-item" href={`${basePath}/pdf`} role="menuitem">
          <Download aria-hidden="true" />
          Download PDF
        </Link>
        <Link className="gg-menu-item" href={`${basePath}/edit`} role="menuitem">
          <Pencil aria-hidden="true" />
          Edit Sale Return
        </Link>
        <button
          className="gg-menu-item is-danger"
          type="button"
          role="menuitem"
          disabled={isDeleting}
          data-close-row-menu=""
          onClick={handleDelete}
        >
          <Trash2 aria-hidden="true" />
          {isDeleting ? "Deleting Sale Return..." : "Delete Sale Return"}
        </button>
      </TableRowActionsMenu>
      {error && (
        <p className="warehouse-toast is-visible" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
