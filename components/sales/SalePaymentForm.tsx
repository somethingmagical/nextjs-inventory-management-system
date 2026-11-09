"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addSalePayment } from "@/app/(authenticated)/sales/[id]/payments/actions";
import {
  initialSalePaymentActionState,
  type SalePaymentActionState,
} from "@/app/(authenticated)/sales/[id]/payments/action-state";

const paymentTypes = ["Cash", "Card", "Bank Transfer", "Other"];

export default function SalePaymentForm({ saleId }: { saleId: string }) {
  const addPayment = addSalePayment.bind(null, saleId);
  const [state, formAction, isPending] = useActionState<SalePaymentActionState, FormData>(
    addPayment,
    initialSalePaymentActionState,
  );
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  return (
    <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="add-sale-payment-title">
      <h2 className="gg-card-title" id="add-sale-payment-title">Add Payment</h2>
      <form action={formAction}>
        <div className="gg-form-grid">
          <label className="gg-field" htmlFor="sale-payment-amount">
            <span className="gg-label">Amount</span>
            <input
              className="gg-input"
              id="sale-payment-amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={isPending}
            />
          </label>
          <label className="gg-field" htmlFor="sale-payment-type">
            <span className="gg-label">Payment Type</span>
            <select
              className="gg-select"
              id="sale-payment-type"
              name="paymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              disabled={isPending}
            >
              {paymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="gg-field" htmlFor="sale-payment-date">
            <span className="gg-label">Date</span>
            <input
              className="gg-input"
              id="sale-payment-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              disabled={isPending}
            />
          </label>
          <label className="gg-field gg-col-span-2" htmlFor="sale-payment-notes">
            <span className="gg-label">Notes</span>
            <textarea
              className="gg-textarea"
              id="sale-payment-notes"
              name="notes"
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isPending}
            />
          </label>
        </div>
        {state.status === "error" && (
          <p className="warehouse-field-error" role="alert">{state.message}</p>
        )}
        <div className="gg-form-actions">
          <Link className="gg-btn gg-btn--secondary" href="/sales">Back to Sales</Link>
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            {isPending ? "Adding Payment..." : "Add Payment"}
          </button>
        </div>
      </form>
    </section>
  );
}
