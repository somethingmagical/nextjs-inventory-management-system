export type SortOrder = "asc" | "desc";
export type TableSortOption = { value: string; label: string };
export type TableSearchParams = Record<string, string | string[] | undefined>;

export function parseSortOrder(
  value: string | string[] | undefined,
  defaultValue: SortOrder = "desc",
): SortOrder {
  return value === "asc" || value === "desc" ? value : defaultValue;
}

export function parseSortBy<const T extends readonly string[]>(
  value: string | string[] | undefined,
  allowedValues: T,
  defaultValue: T[number],
): T[number] {
  return typeof value === "string"
    ? allowedValues.find((allowedValue) => allowedValue === value) ?? defaultValue
    : defaultValue;
}

export function buildTableSortHref(input: {
  pathname: string;
  searchParams: TableSearchParams;
  sortBy: string;
  sortOrder: SortOrder;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (key === "page" || key === "sortBy" || key === "sortOrder") continue;
    if (typeof value === "string") params.set(key, value);
    else value?.forEach((item) => params.append(key, item));
  }
  params.set("sortBy", input.sortBy);
  params.set("sortOrder", input.sortOrder);
  return `${input.pathname}?${params.toString()}`;
}

export function getNextSortOrder(
  key: string,
  currentSortBy: string,
  currentSortOrder: SortOrder,
): SortOrder {
  return key === currentSortBy && currentSortOrder === "asc" ? "desc" : "asc";
}
