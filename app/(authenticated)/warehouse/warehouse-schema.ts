import { z } from "zod";

export const warehouseIdSchema = z.string().trim().min(1).max(191);

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Enter a warehouse name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address.").max(191, "Email must be 191 characters or fewer."),
  phoneNumber: z.string().trim().min(1, "Enter a phone number.").max(40, "Phone number must be 40 characters or fewer."),
  country: z.string().trim().min(1, "Enter a country.").max(100, "Country must be 100 characters or fewer."),
  city: z.string().trim().min(1, "Enter a city.").max(100, "City must be 100 characters or fewer."),
  zipCode: z.string().trim().min(1, "Enter a ZIP code.").max(20, "ZIP code must be 20 characters or fewer."),
});

export type WarehouseValues = z.infer<typeof warehouseSchema>;
