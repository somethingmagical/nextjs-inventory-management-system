import "dotenv/config";

import { defineConfig, env } from "prisma/config";

const password = process.env.DB_PASSWORD;
if (password === undefined) {
  throw new Error("DB_PASSWORD must be set; it may be empty for local development.");
}

const databaseUrl = new URL("mysql://localhost");
databaseUrl.hostname = env("DB_HOST");
databaseUrl.port = env("DB_PORT");
databaseUrl.username = env("DB_USERNAME");
databaseUrl.password = password;
databaseUrl.pathname = `/${encodeURIComponent(env("DB_DATABASE"))}`;

const host = databaseUrl.hostname;
if (host === "tidbcloud.com" || host.endsWith(".tidbcloud.com")) {
  databaseUrl.searchParams.set("sslaccept", "strict");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl.toString(),
  },
});
