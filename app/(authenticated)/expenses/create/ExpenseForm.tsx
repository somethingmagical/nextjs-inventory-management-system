"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Info } from "lucide-react";
import type { ExpenseActionField, ExpenseActionState } from "./action-state";
import { initialExpenseActionState } from "./action-state";

type ExpenseFormAction = (
  state: ExpenseActionState,
  formData: FormData,
) => Promise<ExpenseActionState>;

export type ExpenseFormOptions = {
  warehouses: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

export type ExpenseFormValues = {
  date: string;
  title: string;
  warehouseId: string;
  expenseCategoryId: string;
  amount: string;
  details: string;
};

export default function ExpenseForm({
  mode,
  options,
  initialValues,
  action,
}: {
  mode: "create" | "edit";
  options: ExpenseFormOptions;
  initialValues?: ExpenseFormValues;
  action: ExpenseFormAction;
}) {
  const [state, formAction, isPending] = useActionState(action, initialExpenseActionState);
  const [date, setDate] = useState(() => {
    if (initialValues) return initialValues.date;
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const isEditing = mode === "edit";
  const fieldError = (field: ExpenseActionField) => state.fieldErrors?.[field]?.[0];
  const showError = state.status === "error";

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{isEditing ? "Edit Expense" : "Create Expense"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/expenses">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad" action={formAction}>
        {showError && (
          <p className="warehouse-toast is-visible" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
        <div className="exp-grid">
          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-date">
              Date <span className="gg-req">*</span>
            </label>
            <div className="date-field">
              <input
                className="gg-input gg-num"
                id="expense-date"
                name="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={isPending}
                aria-invalid={Boolean(fieldError("date"))}
                required
              />
              <CalendarDays aria-hidden="true" />
            </div>
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-title">
              Expense Title <span className="gg-req">*</span>
            </label>
            <input
              className="gg-input"
              id="expense-title"
              name="title"
              type="text"
              placeholder="Enter Expense Title"
              defaultValue={initialValues?.title ?? ""}
              maxLength={191}
              disabled={isPending}
              aria-invalid={Boolean(fieldError("title"))}
              required
            />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-warehouse">
              Warehouse <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="expense-warehouse"
              name="warehouseId"
              defaultValue={initialValues?.warehouseId ?? ""}
              disabled={isPending}
              aria-invalid={Boolean(fieldError("warehouseId"))}
              required
            >
              <option value="">Choose Warehouse</option>
              {options.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
            {options.warehouses.length === 0 && (
              <span className="warehouse-field-error" role="status">Create a warehouse before recording an expense.</span>
            )}
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-category">
              Expense Category <span className="gg-req">*</span>
            </label>
            <select
              className="gg-select"
              id="expense-category"
              name="expenseCategoryId"
              defaultValue={initialValues?.expenseCategoryId ?? ""}
              disabled={isPending}
              aria-invalid={Boolean(fieldError("expenseCategoryId"))}
              required
            >
              <option value="">Choose Expense Category</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            {options.categories.length === 0 && (
              <span className="warehouse-field-error" role="status">
                Create an expense category before recording an expense.
              </span>
            )}
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-amount">
              Amount <span className="gg-req">*</span>
            </label>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                id="expense-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="Enter Amount"
                defaultValue={initialValues?.amount ?? ""}
                maxLength={13}
                disabled={isPending}
                aria-invalid={Boolean(fieldError("amount"))}
                required
              />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="expense-details">Details</label>
            <textarea
              className="gg-textarea"
              id="expense-details"
              name="details"
              placeholder="Enter Details"
              defaultValue={initialValues?.details ?? ""}
              maxLength={5000}
              disabled={isPending}
              aria-invalid={Boolean(fieldError("details"))}
            />
          </div>
        </div>

        <div className="gg-form-actions">
          <button
            className="gg-btn gg-btn--primary"
            type="submit"
            disabled={isPending}
          >
            <Check aria-hidden="true" />
            {isPending ? (isEditing ? "Updating..." : "Saving...") : (isEditing ? "Update" : "Save")}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/expenses" aria-disabled={isPending}>Cancel</Link>
        </div>
      </form>
    </main>
  );
}
