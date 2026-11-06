import { z } from "zod";

export const customerIdSchema = z.string().trim().min(1).max(191);

const dateOfBirthSchema = z.union([z.literal(""), z.iso.date()]).transform((value) =>
  value === "" ? null : new Date(`${value}T00:00:00.000Z`),
);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address.").max(191, "Email must be 191 characters or fewer."),
  phoneNumber: z.string().trim().min(1, "Enter a phone number.").max(40, "Phone number must be 40 characters or fewer."),
  dateOfBirth: dateOfBirthSchema,
  country: z.string().trim().min(1, "Enter a country.").max(100, "Country must be 100 characters or fewer."),
  city: z.string().trim().min(1, "Enter a city.").max(100, "City must be 100 characters or fewer."),
  address: z.string().trim().min(1, "Enter an address.").max(191, "Address must be 191 characters or fewer."),
});

export type CustomerValues = {
  name: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  country: string;
  city: string;
  address: string;
};
