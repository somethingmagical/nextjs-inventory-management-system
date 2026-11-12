export function buildPageSizeHref(pathname: string, search: string, pageSize: number) {
  const params = new URLSearchParams(search);
  params.delete("page");
  if (pageSize === 10) params.delete("pageSize");
  else params.set("pageSize", String(pageSize));

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
