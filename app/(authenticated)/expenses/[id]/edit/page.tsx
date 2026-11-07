import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getExpenseAccess } from "../../authorization";
import { expenseIdSchema } from "../../expense-schema";
import { updateExpense } from "../../create/actions";
import ExpenseForm, {
  type ExpenseFormOptions,
  type ExpenseFormValues,
} from "../../create/ExpenseForm";

export const metadata: Metadata = {
  title: "Edit Expense",
  description: "Edit an expense",
};

type EditExpensePageProps = {
  params: Promise<{ id: string }>;
};

export default function EditExpensePage({ params }: EditExpensePageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading expense...</p>
        </main>
      }
    >
      <AuthorizedEditExpense params={params} />
    </Suspense>
  );
}

async function AuthorizedEditExpense({ params }: EditExpensePageProps) {
  await connection();
  const access = await getExpenseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = expenseIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [expense, warehouses, categories] = await Promise.all([
    db.expense.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: {
        date: true,
        title: true,
        warehouseId: true,
        expenseCategoryId: true,
        amount: true,
        details: true,
      },
    }),
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
  if (!expense) notFound();

  const userName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const options: ExpenseFormOptions = { warehouses, categories };
  const initialValues: ExpenseFormValues = {
    date: expense.date.toISOString().slice(0, 10),
    title: expense.title,
    warehouseId: expense.warehouseId,
    expenseCategoryId: expense.expenseCategoryId,
    amount: expense.amount.toString(),
    details: expense.details ?? "",
  };

  return (
    <DashboardLayout user={{ name: userName, image: access.user.image }} pageTitle="Expenses">
      <ExpenseForm
        mode="edit"
        options={options}
        initialValues={initialValues}
        action={updateExpense.bind(null, parsedId.data)}
      />
    </DashboardLayout>
  );
}
