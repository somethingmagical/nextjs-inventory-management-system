import { z } from "zod";

export const purchaseProductSearchSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  query: z.string().trim().min(2).max(120),
});
