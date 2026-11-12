"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildPageSizeHref } from "./page-size-url";

const pageSizeOptions = [10, 25, 50] as const;

export default function DynamicPageSizeSelect({
  id,
  pageSize,
}: {
  id: string;
  pageSize: number;
}) {
  return (
    <Suspense fallback={<PageSizeFallback id={id} pageSize={pageSize} />}>
      <PageSizeSelect id={id} pageSize={pageSize} />
    </Suspense>
  );
}

function PageSizeFallback({ id, pageSize }: { id: string; pageSize: number }) {
  return (
    <div className="gg-perpage" aria-busy="true">
      <label className="gg-muted" htmlFor={id}>Records per page</label>
      <select className="gg-select" id={id} defaultValue={String(pageSize)} disabled>
        {pageSizeOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function PageSizeSelect({ id, pageSize }: { id: string; pageSize: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPageSize, setSelectedPageSize] = useState(pageSize);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedPageSize(pageSize);
  }, [pageSize]);

  function handleChange(value: string) {
    const nextPageSize = Number(value);
    setSelectedPageSize(nextPageSize);

    const href = buildPageSizeHref(pathname, searchParams.toString(), nextPageSize);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="gg-perpage" aria-busy={isPending}>
      <label className="gg-muted" htmlFor={id}>Records per page</label>
      <select
        className="gg-select"
        id={id}
        name="pageSize"
        value={String(selectedPageSize)}
        onChange={(event) => handleChange(event.target.value)}
      >
        {pageSizeOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
