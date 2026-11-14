import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { z } from "zod";

export function parseInternationalPhoneNumber(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  if (!normalized.startsWith("+")) return undefined;

  const parsed = parsePhoneNumberFromString(normalized);
  return parsed?.isPossible() ? parsed : undefined;
}

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  const duplicateCallingCode = trimmed.match(/^(\+\d{1,3})\s+\1([\s().-]*\d.*)$/);
  const candidate = duplicateCallingCode
    ? `${duplicateCallingCode[1]}${duplicateCallingCode[2]}`
    : trimmed;

  return parseInternationalPhoneNumber(candidate)?.number ?? trimmed;
}

function isDuplicateCallingCode(value: string) {
  return /^\+\d{1,3}\s+\+\d/.test(value);
}

export const requiredPhoneNumberSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number.")
  .max(40, "Phone number must be 40 characters or fewer.")
  .transform(normalizePhoneNumber)
  .refine((value) => !isDuplicateCallingCode(value), {
    message: "Enter the phone number with only one country calling code.",
  });

export const optionalPhoneNumberSchema = z
  .string()
  .trim()
  .max(40, "Phone number must be 40 characters or fewer.")
  .transform(normalizePhoneNumber)
  .refine((value) => !isDuplicateCallingCode(value), {
    message: "Enter the phone number with only one country calling code.",
  });
