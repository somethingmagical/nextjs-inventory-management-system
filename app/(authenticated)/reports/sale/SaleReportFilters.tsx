"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";
import TableFilterPopover from "@/components/shared/TableFilterPopover";

type SaleReportFiltersProps = {
  query: string;
  date: string;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  children: ReactNode;
  actions: ReactNode;
};

export default function SaleReportFilters({
  query: initialQuery,
  date: initialDate,
  pageSize: initialPageSize,
  sortBy,
  sortOrder,
  children,
  actions,
}: SaleReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [date, setDate] = useState(initialDate);
  const [isPending, startTransition] = useTransition();
  const queryRef = useRef(query);
  const dateRef = useRef(date);
  const pageSizeRef = useRef(initialPageSize);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (document.activeElement !== document.getElementById("sale-report-search")) {
      setQuery(initialQuery);
      queryRef.current = initialQuery;
    }
    if (document.activeElement !== document.getElementById("sale-report-date")) {
      setDate(initialDate);
      dateRef.current = initialDate;
    }
    pageSizeRef.current = initialPageSize;
  }, [initialQuery, initialDate, initialPageSize]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function applyFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;

    const params = new URLSearchParams();
    const trimmedQuery = queryRef.current.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (dateRef.current) params.set("date", dateRef.current);
    if (pageSizeRef.current !== 10) params.set("pageSize", String(pageSizeRef.current));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);

    const queryString = params.toString();
    const href = queryString ? `/reports/sale?${queryString}` : "/reports/sale";
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    queryRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applyFilters();
    }, 300);
  }

  function syncFromUrl(control: "query" | "date") {
    if (debounceRef.current || isPending) return;
    if (control === "query") {
      const value = searchParams.get("q") ?? "";
      setQuery(value);
      queryRef.current = value;
    } else if (control === "date") {
      const value = searchParams.get("date") ?? "";
      setDate(value);
      dateRef.current = value;
    }
  }

  return (
    <div className="report-toolbar-controls" aria-busy={isPending}>
      <form className="sale-report-search" role="search" onSubmit={handleSearchSubmit}>
        <label className="sr-only" htmlFor="sale-report-search">Search sales</label>
        <div className="gg-input-icon">
          <Search aria-hidden="true" />
          <input
            className="gg-input"
            id="sale-report-search"
            name="q"
            type="search"
            placeholder="Search"
            value={query}
            maxLength={120}
            onChange={(event) => handleQueryChange(event.target.value)}
            onBlur={() => syncFromUrl("query")}
          />
        </div>
      </form>

      <div className="gg-spacer" />

      <TableFilterPopover label="Filter sales">
        <form className="sale-report-date-form" onSubmit={handleSearchSubmit}>
          <label className="dynamic-filter-label" htmlFor="sale-report-date">Filter sales by date</label>
          <div className="sale-report-date-field">
            <input
              className="gg-input"
              id="sale-report-date"
              name="date"
              type="date"
              value={date}
              aria-label="Filter by date"
              onChange={(event) => {
                const value = event.target.value;
                setDate(value);
                dateRef.current = value;
                applyFilters();
              }}
              onBlur={() => syncFromUrl("date")}
            />
            <CalendarDays aria-hidden="true" />
          </div>
        </form>
        {children}
      </TableFilterPopover>
      {actions}
      <span className="sr-only" aria-live="polite">
        {isPending ? "Updating sales..." : ""}
      </span>
    </div>
  );
}

export function SaleReportPageSize({
  query,
  date,
  pageSize,
  options,
  sortBy,
  sortOrder,
}: {
  query: string;
  date: string;
  pageSize: number;
  options: readonly number[];
  sortBy: string;
  sortOrder: "asc" | "desc";
}) {
  const router = useRouter();
  const [selectedPageSize, setSelectedPageSize] = useState(pageSize);

  useEffect(() => {
    setSelectedPageSize(pageSize);
  }, [pageSize]);

  function handleChange(value: string) {
    const nextPageSize = Number(value);
    setSelectedPageSize(nextPageSize);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (date) params.set("date", date);
    if (nextPageSize !== 10) params.set("pageSize", String(nextPageSize));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    const queryString = params.toString();
    const href = queryString ? `/reports/sale?${queryString}` : "/reports/sale";
    router.replace(href, { scroll: false });
  }

  return (
    <div className="gg-perpage" aria-busy={selectedPageSize !== pageSize}>
      <label className="gg-muted" htmlFor="sale-report-page-size">Records per page</label>
      <select
        className="gg-select"
        id="sale-report-page-size"
        name="pageSize"
        value={String(selectedPageSize)}
        onChange={(event) => handleChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
