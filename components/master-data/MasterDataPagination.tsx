import Link from "next/link";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";

export default function MasterDataPagination({
  listPath,
  pageSize,
  query,
  currentPage,
  totalPages,
  totalCount,
  sortBy,
  sortOrder,
}: {
  listPath: string;
  pageSize: number;
  query: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="gg-pagination">
      <DynamicPageSizeSelect id={`${listPath}-page-size`} pageSize={pageSize} />
      <span className="gg-muted gg-num" aria-live="polite">
        {firstRecord}–{lastRecord} of {totalCount}
      </span>
      <div className="gg-spacer" />
      <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="First page">
        <ChevronFirst aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Previous page">
        <ChevronLeft aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Next page">
        <ChevronRight aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Last page">
        <ChevronLast aria-hidden="true" />
      </PaginationLink>
    </div>
  );
}

function PaginationLink({
  page,
  currentPage,
  totalPages,
  listPath,
  query,
  pageSize,
  sortBy,
  sortOrder,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  listPath: string;
  query: string;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  if (sortBy) params.set("sortBy", sortBy);
  if (sortOrder) params.set("sortOrder", sortOrder);

  if (isDisabled) {
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }

  return <Link className="gg-page-btn" href={`${listPath}?${params.toString()}`} aria-label={label}>{children}</Link>;
}
