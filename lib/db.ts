import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  const host = process.env.DB_HOST;
  const portValue = process.env.DB_PORT;
  const user = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;

  if (!host || !portValue || !user || password === undefined || !database) {
    throw new Error(
      "DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, and DB_DATABASE must be set to connect to MySQL.",
    );
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port.");
  }

  const isTiDBCloud =
    host === "tidbcloud.com" || host.endsWith(".tidbcloud.com");
  const adapter = new PrismaMariaDb({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 5,
    connectTimeout: 10_000,
    ...(isTiDBCloud ? { ssl: { rejectUnauthorized: true } } : {}),
  });

  return new PrismaClient({ adapter });
}

declare global {
  var prisma: PrismaClient | undefined;
}

export const db = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
