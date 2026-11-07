"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type AutoSearchFormProps = {
  action: string;
  className: string;
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  iconClassName?: string;
  maxLength?: number;
};

export default function AutoSearchForm({
  action,
  className,
  id,
  label,
  value: initialValue,
  placeholder = "Search",
  iconClassName = "gg-input-icon",
  maxLength = 120,
}: AutoSearchFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const valueRef = useRef(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (document.activeElement === document.getElementById(id)) return;
    setValue(initialValue);
    valueRef.current = initialValue;
  }, [id, initialValue]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function applySearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;

    const params = new URLSearchParams(window.location.search);
    const trimmedValue = valueRef.current.trim();
    if (trimmedValue) params.set("q", trimmedValue);
    else params.delete("q");
    params.delete("page");

    const queryString = params.toString();
    const href = queryString ? `${action}?${queryString}` : action;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applySearch();
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    valueRef.current = nextValue;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applySearch, 300);
  }

  return (
    <form
      className={className}
      action={action}
      role="search"
      aria-busy={isPending}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className={iconClassName}>
        <Search aria-hidden="true" />
        <input
          className="gg-input"
          id={id}
          name="q"
          type="search"
          placeholder={placeholder}
          value={value}
          maxLength={maxLength}
          onChange={(event) => handleChange(event.target.value)}
        />
      </div>
    </form>
  );
}
