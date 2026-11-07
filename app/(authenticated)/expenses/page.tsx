import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MasterDataPagination from "@/components/master-data/MasterDataPagination";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getExpenseAccess } from "./authorization";
import ExpenseRowActions from "./ExpenseRowActions";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Expenses",
  description: "Manage expenses",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

type ExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ExpensesPage({ searchParams }: ExpensesPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading expenses...</p>
        </main>
      }
    >
      <ExpenseList searchParams={searchParams} />
    </Suspense>
  );
}

async function ExpenseList({ searchParams }: ExpensesPageProps) {
  await connection();
  const access = await getExpenseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const searchConditions: Prisma.ExpenseWhereInput[] = [
    { reference: { contains: query } },
    { title: { contains: query } },
    { warehouse: { is: { name: { contains: query } } } },
    { expenseCategory: { is: { name: { contains: query } } } },
  ];
  const where: Prisma.ExpenseWhereInput = {
    deletedAt: null,
    ...(query ? { OR: searchConditions } : {}),
  };
  const fetchPage = (page: number) => db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      title: true,
      amount: true,
      date: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      expenseCategory: { select: { name: true } },
    },
  });
  const [totalCount, requestedExpenses] = await Promise.all([
    db.expense.count({ where }),
    fetchPage(requestedPage),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const expenses = currentPage === requestedPage
    ? requestedExpenses
    : await fetchPage(currentPage);
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Expenses">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={created
              ? "Expense created successfully."
              : updated
                ? "Expense updated successfully."
                : "Expense deleted successfully."}
          />
        )}
        <div className="gg-table-toolbar">
          <AutoSearchForm
            action="/expenses"
            className="warehouse-search-form"
            iconClassName="gg-input-icon warehouse-search-control"
            id="expense-search"
            label="Search expenses"
            value={query}
          />
          <div className="gg-spacer" />
          <Link className="gg-btn gg-btn--primary" href="/expenses/create">
            <Plus aria-hidden="true" />
            Create Expense
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Expense Title</th>
                  <th scope="col">Warehouse</th>
                  <th scope="col">Expense Category</th>
                  <th scope="col" className="gg-num">Amount</th>
                  <th scope="col">Created On</th>
                  <th scope="col" className="product-actions-heading">Action</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td><span className="gg-chip-code">{expense.reference}</span></td>
                    <td className="gg-td-strong">{expense.title}</td>
                    <td>{expense.warehouse.name}</td>
                    <td>{expense.expenseCategory.name}</td>
                    <td className="gg-num gg-td-strong">$ {expense.amount.toFixed(2)}</td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {expense.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                        <time dateTime={expense.createdAt.toISOString()}>
                          {expense.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </time>
                      </span>
                    </td>
                    <td className="product-actions-cell">
                      <ExpenseRowActions expenseId={expense.id} title={expense.title} />
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={7}>
                      <p className="warehouse-empty-title">
                        {query ? "No expenses match your search" : "No expenses yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try changing the search term."
                          : "Create an expense to start tracking money out."}
                      </p>
                      {query ? (
                        <Link className="gg-btn gg-btn--secondary" href="/expenses">
                          Clear search
                        </Link>
                      ) : (
                        <Link className="gg-btn gg-btn--primary" href="/expenses/create">
                          <Plus aria-hidden="true" />
                          Create Expense
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <MasterDataPagination
            listPath="/expenses"
            pageSize={pageSize}
            query={query}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        </div>
      </main>
    </DashboardLayout>
  );
}
