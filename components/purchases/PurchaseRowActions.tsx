"use client";

import Link from "next/link";
import { Download, Pencil, Trash2, Eye } from "lucide-react";
import TableRowActionsMenu from "@/components/shared/TableRowActionsMenu";

export default function PurchaseRowActions({
  purchaseId,
  reference,
}: {
  purchaseId: string;
  reference: string;
}) {
  return (
    <TableRowActionsMenu label={reference}>
      <Link
        className="gg-menu-item"
        href={`/purchases/${encodeURIComponent(purchaseId)}`}
        role="menuitem"
      >
        <Eye aria-hidden="true" />
        View Purchase
      </Link>
      <Link
        className="gg-menu-item"
        href={`/purchases/${encodeURIComponent(purchaseId)}/pdf`}
        role="menuitem"
      >
        <Download aria-hidden="true" />
        Download PDF
      </Link>
      <Link
        className="gg-menu-item"
        href={`/purchases/${encodeURIComponent(purchaseId)}/edit`}
        role="menuitem"
      >
        <Pencil aria-hidden="true" />
        Edit Purchase
      </Link>
      <button
        className="gg-menu-item is-danger"
        type="button"
        role="menuitem"
        disabled
        title="Delete will be available in the delete step."
      >
        <Trash2 aria-hidden="true" />
        Delete Purchase
      </button>
    </TableRowActionsMenu>
  );
}
