import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getExpenseAccess } from "../authorization";
import ExpenseForm, { type ExpenseFormOptions } from "./ExpenseForm";
import { createExpense } from "./actions";

export const metadata: Metadata = {
  title: "Create Expense",
  description: "Record an expense",
};

export default function CreateExpensePage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading expense form...</p>
        </main>
      }
    >
      <AuthorizedCreateExpense />
    </Suspense>
  );
}

async function AuthorizedCreateExpense() {
  await connection();
  const access = await getExpenseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [warehouses, categories] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.expenseCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const userName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const options: ExpenseFormOptions = { warehouses, categories };

  return (
    <DashboardLayout user={{ name: userName, image: access.user.image }} pageTitle="Expenses">
      <ExpenseForm mode="create" options={options} action={createExpense} />
    </DashboardLayout>
  );
}
