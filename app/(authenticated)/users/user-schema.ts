import { z } from "zod";
import { optionalPhoneNumberSchema } from "@/lib/phone-number";

export const userIdSchema = z.string().trim().min(1).max(191);

const userFields = {
  firstName: z.string().trim().min(1, "Enter a first name.").max(80, "First name must be 80 characters or fewer."),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80, "Last name must be 80 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address.").max(254, "Email must be 254 characters or fewer."),
  phoneNumber: optionalPhoneNumberSchema,
  role: z.string().trim().min(1, "Select a role.").max(191),
};

export const createUserSchema = z.object({
  ...userFields,
  password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password must be 128 characters or fewer."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

export const updateUserSchema = z.object({
  ...userFields,
  password: z.string().max(128, "Password must be 128 characters or fewer."),
  confirmPassword: z.string().max(128, "Password must be 128 characters or fewer."),
}).superRefine((value, context) => {
  if (value.password && value.password.length < 8) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "Password must be at least 8 characters.",
    });
  }

  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    });
  }
});

export type CreateUserValues = z.infer<typeof createUserSchema>;
export type UpdateUserValues = z.infer<typeof updateUserSchema>;

export type UserFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  image: string | null;
};
