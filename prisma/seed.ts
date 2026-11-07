import "dotenv/config";

import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "../lib/db";
import { PERMISSIONS } from "../lib/permissions";

const adminSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  firstName: z.string().trim().min(1).default("Admin"),
  lastName: z.string().trim().min(1).default("User"),
  phoneNumber: z.string().trim().optional(),
  image: z.string().trim().url().optional(),
});

async function seedDirectCustomer() {
  await db.customer.upsert({
    where: { id: "direct-customer" },
    update: {
      name: "direct-customer",
      deletedAt: null,
    },
    create: {
      id: "direct-customer",
      name: "direct-customer",
      email: "direct-customer@inventory.local",
      phoneNumber: "N/A",
      country: "N/A",
      city: "N/A",
      address: "POS walk-in customer",
    },
  });

  console.info("Default direct customer ensured.");
}

async function seedAdmin() {
  const parsed = adminSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    firstName: process.env.ADMIN_FIRST_NAME || undefined,
    lastName: process.env.ADMIN_LAST_NAME || undefined,
    phoneNumber: process.env.ADMIN_PHONE_NUMBER || undefined,
    image: process.env.ADMIN_IMAGE || undefined,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid admin seed configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const adminRole = await db.role.upsert({
    where: { name: "admin" },
    update: { deletedAt: null },
    create: { name: "admin" },
    select: { id: true },
  });
  await db.rolePermission.createMany({
    data: PERMISSIONS.map((permission) => ({ roleId: adminRole.id, permission })),
    skipDuplicates: true,
  });

  const password = await hash(parsed.data.password, 12);
  const admin = await db.user.upsert({
    where: { email: parsed.data.email },
    update: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      password,
      phoneNumber: parsed.data.phoneNumber ?? null,
      image: parsed.data.image ?? null,
      role: "admin",
      roleId: adminRole.id,
    },
    create: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      password,
      phoneNumber: parsed.data.phoneNumber ?? null,
      image: parsed.data.image ?? null,
      role: "admin",
      roleId: adminRole.id,
    },
    select: { email: true },
  });

  console.info(`Admin user seeded: ${admin.email}`);
}

seedDirectCustomer()
  .then(seedAdmin)
  .catch((error: unknown) => {
    console.error("Failed to seed admin user.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
