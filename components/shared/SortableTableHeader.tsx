import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  buildTableSortHref,
  getNextSortOrder,
  type SortOrder,
  type TableSearchParams,
} from "@/lib/table-sorting";

export default function SortableTableHeader({
  label,
  sortKey,
  sortBy,
  sortOrder,
  pathname,
  searchParams,
  className,
}: {
  label: string;
  sortKey: string;
  sortBy: string;
  sortOrder: SortOrder;
  pathname: string;
  searchParams: TableSearchParams;
  className?: string;
}) {
  const active = sortBy === sortKey;
  const nextOrder = getNextSortOrder(sortKey, sortBy, sortOrder);
  const href = buildTableSortHref({
    pathname,
    searchParams,
    sortBy: sortKey,
    sortOrder: nextOrder,
  });
  const Icon = active ? (sortOrder === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={className} scope="col" aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
      <Link className="gg-table-sort-link" href={href} title={`Sort by ${label} ${nextOrder}ending`}>
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </Link>
    </th>
  );
}
