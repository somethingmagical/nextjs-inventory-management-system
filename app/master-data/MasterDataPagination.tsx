import Link from "next/link";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

export default function MasterDataPagination({
  listPath,
  pageSize,
  query,
  currentPage,
  totalPages,
  totalCount,
}: {
  listPath: string;
  pageSize: number;
  query: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
}) {
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="gg-pagination">
      <form className="gg-perpage" action={listPath}>
        <label className="gg-muted" htmlFor={`${listPath}-page-size`}>Records per page</label>
        <select className="gg-select" id={`${listPath}-page-size`} name="pageSize" defaultValue={String(pageSize)}>
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
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
      <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} label="First page">
        <ChevronFirst aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} label="Previous page">
        <ChevronLeft aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} label="Next page">
        <ChevronRight aria-hidden="true" />
      </PaginationLink>
      <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} listPath={listPath} query={query} pageSize={pageSize} label="Last page">
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
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  listPath: string;
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

  return <Link className="gg-page-btn" href={`${listPath}?${params.toString()}`} aria-label={label}>{children}</Link>;
}
