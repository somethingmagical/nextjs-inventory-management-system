"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  CornerUpRight,
  DollarSign,
  Download,
  Eye,
  Info,
  Pencil,
  Trash2,
} from "lucide-react";
import { deleteSale } from "@/app/(authenticated)/sales/create/actions";
import TableRowActionsMenu from "@/components/shared/TableRowActionsMenu";

export default function SaleRowActions({
  saleId,
  reference,
}: {
  saleId: string;
  reference: string;
}) {
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    if (!window.confirm(
      `Delete ${reference}? The sold quantities will be returned to the warehouse. Existing payment history will be retained.`,
    )) {
      return;
    }

    setError("");
    startDelete(async () => {
      const result = await deleteSale(saleId);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <div>
      <TableRowActionsMenu label={reference}>
        <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}`} role="menuitem">
          <Eye aria-hidden="true" />
          View Sale
        </Link>
        <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/pdf`} role="menuitem">
          <Download aria-hidden="true" />
          Download PDF
        </Link>
        <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/payments`} role="menuitem">
          <DollarSign aria-hidden="true" />
          Show Payments
        </Link>
        <Link className="gg-menu-item" href={`/sales/returns/create?saleId=${encodeURIComponent(saleId)}`} role="menuitem">
          <CornerUpRight aria-hidden="true" />
          Create Sale Return
        </Link>
        <Link className="gg-menu-item" href={`/sales/${encodeURIComponent(saleId)}/edit`} role="menuitem">
          <Pencil aria-hidden="true" />
          Edit Sale
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
          {isDeleting ? "Deleting Sale..." : "Delete Sale"}
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
