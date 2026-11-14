import { z } from "zod";

const sourceSchema = z.object({
  source: z.string().trim().min(1).max(100),
  sourceType: z.enum(["external_api", "external_dataset", "local_dataset", "local_metadata", "manual"]),
  isManual: z.boolean(),
});

const locationRecordSchema = sourceSchema.extend({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["country", "administrative_area", "city", "suburb", "street", "postal_code"]),
  code: z.string().max(100).optional(),
  level: z.number().int().min(1).max(4).optional(),
  externalId: z.string().max(200).optional(),
});

export const addressDataSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  country: locationRecordSchema.nullable(),
  administrativeAreas: z.array(locationRecordSchema).max(4),
  city: locationRecordSchema.nullable(),
  suburb: locationRecordSchema.nullable(),
  street: locationRecordSchema.nullable(),
  postalCode: locationRecordSchema.nullable(),
  houseNumber: z.string().max(50),
  buildingName: z.string().max(200),
  unitNumber: z.string().max(100),
  additionalAddress: z.string().max(500),
});

export type AddressData = z.infer<typeof addressDataSchema>;

export const addressDataFormSchema = z
  .union([z.string().max(20_000), z.null()])
  .optional()
  .transform((rawValue, context): AddressData | null => {
    if (typeof rawValue !== "string" || !rawValue.trim()) return null;

    let value: unknown;
    try {
      value = JSON.parse(rawValue);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Address details are invalid. Review the location fields and try again.",
      });
      return z.NEVER;
    }

    const parsed = addressDataSchema.safeParse(value);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: "Address details are invalid. Review the location fields and try again.",
      });
      return z.NEVER;
    }
    return parsed.data;
  });
