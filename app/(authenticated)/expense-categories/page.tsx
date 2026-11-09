import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MasterDataManager from "@/components/master-data/MasterDataManager";
import MasterDataPagination from "@/components/master-data/MasterDataPagination";
import type { MasterDataItem } from "@/app/master-data/action-state";
import { getExpenseCategoryListData } from "@/features/expenses/categories/queries";
import { getExpenseCategoryAccess } from "./authorization";
import { createExpenseCategory, deleteExpenseCategory, updateExpenseCategory } from "./actions";

export const metadata: Metadata = {
  title: "Expense Categories",
  description: "Manage expense categories",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

type ExpenseCategoriesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ExpenseCategoriesPage({ searchParams }: ExpenseCategoriesPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading expense categories...</p>
        </main>
      }
    >
      <ExpenseCategoryList searchParams={searchParams} />
    </Suspense>
  );
}

async function ExpenseCategoryList({ searchParams }: ExpenseCategoriesPageProps) {
  await connection();
  const access = await getExpenseCategoryAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const { totalCount, totalPages, currentPage, items: categories } = await getExpenseCategoryListData({
    query,
    requestedPage,
    pageSize,
  });
  const items: MasterDataItem[] = categories.map((category) => ({
    ...category,
    logo: null,
  }));

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const pagination = (
    <MasterDataPagination
      listPath="/expense-categories"
      pageSize={pageSize}
      query={query}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
    />
  );
  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Expense Categories">
      <main className="gg-content">
        <MasterDataManager
          entity="Expense Category"
          listPath="/expense-categories"
          query={query}
          pageSize={pageSize}
          items={items}
          pagination={pagination}
          createAction={createExpenseCategory}
          updateAction={updateExpenseCategory}
          deleteAction={deleteExpenseCategory}
        />
      </main>
    </DashboardLayout>
  );
}
