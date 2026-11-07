import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Prisma, TransferStatus } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TransferTable, { type TransferListRow } from "@/components/transfers/TransferTable";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getTransferAccess } from "./authorization";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Transfers",
  description: "Move products between warehouses",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

type TransfersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TransfersPage({ searchParams }: TransfersPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading transfers...</p>
        </main>
      }
    >
      <TransferList searchParams={searchParams} />
    </Suspense>
  );
}

async function TransferList({ searchParams }: TransfersPageProps) {
  await connection();
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const statusMatch = Object.values(TransferStatus)
    .find((status) => status.toLowerCase() === query.toLowerCase());
  const searchConditions: Prisma.TransferWhereInput[] = [
    { reference: { contains: query } },
    { fromWarehouse: { is: { name: { contains: query } } } },
    { toWarehouse: { is: { name: { contains: query } } } },
    {
      items: {
        some: {
          product: {
            is: {
              OR: [
                { name: { contains: query } },
                { code: { contains: query } },
              ],
            },
          },
        },
      },
    },
  ];
  if (statusMatch) searchConditions.push({ status: statusMatch });

  const where: Prisma.TransferWhereInput = {
    deletedAt: null,
    ...(query ? { OR: searchConditions } : {}),
  };
  const fetchPage = (page: number) => db.transfer.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const [totalCount, requestedTransfers] = await Promise.all([
    db.transfer.count({ where }),
    fetchPage(requestedPage),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const transfers = currentPage === requestedPage
    ? requestedTransfers
    : await fetchPage(currentPage);
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";
  const transferRows: TransferListRow[] = transfers.map((transfer) => ({
    id: transfer.id,
    reference: transfer.reference,
    fromWarehouse: transfer.fromWarehouse.name,
    toWarehouse: transfer.toWarehouse.name,
    itemCount: transfer._count.items,
    grandTotal: transfer.grandTotal.toFixed(2),
    status: transfer.status,
    createdAt: transfer.createdAt.toISOString(),
    createdTime: transfer.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }),
    createdDate: transfer.createdAt.toLocaleDateString("en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
  }));

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Transfers">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={created
              ? "Transfer created successfully."
              : updated
                ? "Transfer updated successfully."
                : "Transfer deleted successfully."}
          />
        )}
        <div className="gg-table-toolbar">
          <AutoSearchForm
            action="/transfers"
            className="transfer-search-form"
            id="transfer-search"
            label="Search transfers"
            value={query}
          />
          <div className="gg-spacer" />
          <Link className="gg-btn gg-btn--primary" href="/transfers/create">
            <Plus aria-hidden="true" />
            Create Transfer
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <TransferTable transfers={transferRows} isFiltered={Boolean(query)} />
          </div>
          <div className="gg-pagination">
            <form className="gg-perpage" action="/transfers">
              <label className="gg-muted" htmlFor="transfer-page-size">Records per page</label>
              <select
                className="gg-select"
                id="transfer-page-size"
                name="pageSize"
                defaultValue={String(pageSize)}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {query && <input type="hidden" name="q" value={query} />}
              <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
                <ChevronRight aria-hidden="true" />
              </button>
            </form>
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Last page">
              <ChevronLast aria-hidden="true" />
            </PaginationLink>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

function PaginationLink({
  page,
  currentPage,
  totalPages,
  query,
  pageSize,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  pageSize: number;
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);

  if (isDisabled) {
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }
  return <Link className="gg-page-btn" href={`/transfers?${params.toString()}`} aria-label={label}>{children}</Link>;
}
