"use client";

import Link from "next/link";
import { useState } from "react";
import TransferRowActions from "./TransferRowActions";

export type TransferListRow = {
  id: string;
  reference: string;
  fromWarehouse: string;
  toWarehouse: string;
  itemCount: number;
  grandTotal: string;
  status: "Pending" | "Sent" | "Completed";
  createdAt: string;
  createdTime: string;
  createdDate: string;
};

export default function TransferTable({
  transfers,
  isFiltered,
}: {
  transfers: TransferListRow[];
  isFiltered: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allSelected = transfers.length > 0 && transfers.every((transfer) => selectedIds.has(transfer.id));
  const partiallySelected = !allSelected && transfers.some((transfer) => selectedIds.has(transfer.id));

  function toggleAll() {
    setSelectedIds((current) => {
      if (allSelected) return new Set();
      return new Set([...current, ...transfers.map((transfer) => transfer.id)]);
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <table className="gg-table transfer-list-table">
      <thead>
        <tr>
          <th scope="col" style={{ width: 44 }}>
            <input
              type="checkbox"
              className="gg-check"
              aria-label="Select all transfers on this page"
              aria-checked={partiallySelected ? "mixed" : allSelected}
              checked={allSelected}
              ref={(input) => {
                if (input) input.indeterminate = partiallySelected;
              }}
              onChange={toggleAll}
            />
          </th>
          <th scope="col">Reference</th>
          <th scope="col">From Warehouse</th>
          <th scope="col">To Warehouse</th>
          <th scope="col">Items</th>
          <th scope="col" className="gg-num">Grand Total</th>
          <th scope="col">Status</th>
          <th scope="col">Created On</th>
          <th scope="col" className="transfer-actions-heading">Action</th>
        </tr>
      </thead>
      <tbody>
        {transfers.map((transfer) => (
          <tr key={transfer.id}>
            <td>
              <input
                type="checkbox"
                className="gg-check"
                aria-label={`Select transfer ${transfer.reference}`}
                checked={selectedIds.has(transfer.id)}
                onChange={() => toggleOne(transfer.id)}
              />
            </td>
            <td><span className="gg-chip-code">{transfer.reference}</span></td>
            <td>{transfer.fromWarehouse}</td>
            <td>{transfer.toWarehouse}</td>
            <td className="gg-num">{transfer.itemCount}</td>
            <td className="gg-num gg-td-strong">$ {transfer.grandTotal}</td>
            <td>
              <span className={`gg-badge ${transfer.status === "Completed"
                ? "gg-badge--success"
                : transfer.status === "Sent"
                  ? "gg-badge--info"
                  : "gg-badge--warning"}`}
              >
                {transfer.status}
              </span>
            </td>
            <td>
              <span className="gg-chip-time gg-num">
                {transfer.createdTime}
                <time dateTime={transfer.createdAt}>{transfer.createdDate}</time>
              </span>
            </td>
            <td className="transfer-actions-cell">
              <TransferRowActions transferId={transfer.id} reference={transfer.reference} />
            </td>
          </tr>
        ))}
        {transfers.length === 0 && (
          <tr>
            <td className="product-empty-cell" colSpan={9}>
              <p className="warehouse-empty-title">
                {isFiltered ? "No transfers match your search" : "No transfers yet"}
              </p>
              <p className="gg-muted">
                {isFiltered
                  ? "Try changing the search term."
                  : "Create a transfer to move stock between warehouses."}
              </p>
              {isFiltered ? (
                <Link className="gg-btn gg-btn--secondary" href="/transfers">Clear search</Link>
              ) : (
                <Link className="gg-btn gg-btn--primary" href="/transfers/create">
                  Create Transfer
                </Link>
              )}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
