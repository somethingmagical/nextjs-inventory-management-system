export function buildDynamicFilterHref(
  pathname: string,
  search: string,
  name: string,
  value: string,
  clearParams: readonly string[] = [],
) {
  const params = new URLSearchParams(search);
  params.delete("page");
  clearParams.forEach((key) => params.delete(key));
  if (value) params.set(name, value);
  else params.delete(name);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
