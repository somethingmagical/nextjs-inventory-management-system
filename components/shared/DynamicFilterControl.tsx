"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildDynamicFilterHref } from "@/lib/dynamic-filter-url";

type FilterOption = { value: string; label: string };
type DynamicFilterControlProps = {
  id: string;
  name: string;
  label: string;
  value: string;
  type?: "select" | "date" | "month";
  options?: readonly FilterOption[];
  className?: string;
  wrapperClassName?: string;
  visibleLabel?: boolean;
  labelClassName?: string;
  clearParams?: readonly string[];
};

export default function DynamicFilterControl(props: DynamicFilterControlProps) {
  return (
    <Suspense fallback={<span className="gg-muted" aria-busy="true" />}>
      <DynamicFilterControlContent {...props} />
    </Suspense>
  );
}

function DynamicFilterControlContent({
  id,
  name,
  label,
  value: initialValue,
  type = "select",
  options = [],
  className = "gg-select",
  wrapperClassName,
  visibleLabel = false,
  labelClassName,
  clearParams = [],
}: DynamicFilterControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(initialValue), [initialValue]);

  function applyFilter(nextValue: string) {
    setValue(nextValue);
    const href = buildDynamicFilterHref(
      pathname,
      searchParams.toString(),
      name,
      nextValue,
      clearParams,
    );
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className={`dynamic-filter-control${wrapperClassName ? ` ${wrapperClassName}` : ""}`} aria-busy={isPending}>
      <label
        className={visibleLabel
          ? `dynamic-filter-label${labelClassName ? ` ${labelClassName}` : ""}`
          : "sr-only"}
        htmlFor={id}
      >
        {label}
      </label>
      <span className="dynamic-filter-input-wrap">
        {type === "select" ? (
          <select
            className={className}
            id={id}
            name={name}
            value={value}
            onChange={(event) => applyFilter(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            className={className}
            id={id}
            name={name}
            type={type}
            value={value}
            aria-label={label}
            onChange={(event) => applyFilter(event.target.value)}
          />
        )}
      </span>
    </div>
  );
}
