import { z } from "zod";
import { addressDataFormSchema } from "@/lib/geography/address-data";
import { requiredPhoneNumberSchema } from "@/lib/phone-number";

export const customerIdSchema = z.string().trim().min(1).max(191);

const dateOfBirthSchema = z.union([z.literal(""), z.iso.date()]).transform((value) =>
  value === "" ? null : new Date(`${value}T00:00:00.000Z`),
);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address.").max(191, "Email must be 191 characters or fewer."),
  phoneNumber: requiredPhoneNumberSchema,
  dateOfBirth: dateOfBirthSchema,
  country: z.string().trim().min(1, "Enter a country.").max(100, "Country must be 100 characters or fewer."),
  countryCode: z.union([z.literal(""), z.string().regex(/^[A-Za-z]{2}$/)]).optional().transform((value) => value?.toUpperCase() || null),
  region: z.string().trim().max(100, "Region must be 100 characters or fewer.").optional().transform((value) => value || null),
  city: z.string().trim().min(1, "Enter a city.").max(100, "City must be 100 characters or fewer."),
  suburb: z.string().trim().max(100, "Suburb must be 100 characters or fewer.").transform((value) => value || null),
  zipCode: z.string().trim().max(20, "Postal code must be 20 characters or fewer.").optional().transform((value) => value || null),
  address: z.string().trim().max(191, "Address must be 191 characters or fewer.").default(""),
  addressData: addressDataFormSchema,
});

export type CustomerValues = {
  name: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  country: string;
  countryCode?: string;
  region: string;
  city: string;
  suburb: string;
  zipCode: string;
  address: string;
  addressData?: string;
};
