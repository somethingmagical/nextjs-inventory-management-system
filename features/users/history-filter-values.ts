import { z } from "zod";

export const userHistoryExportLimit = 10_000;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export const userHistoryFilterSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  action: z.enum(["all", "created", "updated", "deleted"]).optional().default("all"),
  from: dateSchema.optional().default(""),
  to: dateSchema.optional().default(""),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: "The start date must be before or equal to the end date.",
  path: ["from"],
});

export type UserHistoryFilters = z.infer<typeof userHistoryFilterSchema>;

export function parseUserHistoryFilters(input: Record<string, unknown>) {
  return userHistoryFilterSchema.safeParse(input);
}

export function hasUserHistoryFilters(filters: UserHistoryFilters) {
  return Boolean(filters.q || filters.action !== "all" || filters.from || filters.to);
}

export function toUserHistorySearchParams(filters: UserHistoryFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page && page > 1) params.set("page", String(page));
  return params;
}
