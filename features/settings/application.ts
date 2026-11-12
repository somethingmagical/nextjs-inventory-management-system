import "server-only";

import { cacheTag } from "next/cache";
import { db } from "@/lib/db";

export const defaultFaviconPath = "/favicon-default.ico";

export async function readApplicationSettings() {
  const settings = await db.applicationSetting.findUnique({
    where: { id: "application" },
    select: { appName: true, faviconPath: true, headerLogoPath: true },
  });

  return {
    appName: settings?.appName ?? process.env.NEXT_PUBLIC_APP_NAME ?? "Inventory",
    faviconPath: settings?.faviconPath ?? defaultFaviconPath,
    headerLogoPath: settings?.headerLogoPath ?? null,
  };
}

export async function getApplicationSettings() {
  "use cache";
  cacheTag("application-settings");
  return readApplicationSettings();
}

export async function saveApplicationSettings(input: {
  appName: string;
  faviconPath: string | null;
  headerLogoPath: string | null;
}) {
  return db.applicationSetting.upsert({
    where: { id: "application" },
    create: {
      id: "application",
      appName: input.appName,
      faviconPath: input.faviconPath,
      headerLogoPath: input.headerLogoPath,
    },
    update: {
      appName: input.appName,
      faviconPath: input.faviconPath,
      headerLogoPath: input.headerLogoPath,
    },
  });
}
