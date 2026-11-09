import { z } from "zod";

export const applicationNameSchema = z.string()
  .trim()
  .min(1, "Enter a website name.")
  .max(100, "Website name must be 100 characters or fewer.");
