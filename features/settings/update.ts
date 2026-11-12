import "server-only";

import {
  readApplicationSettings,
  saveApplicationSettings,
} from "./application";
import { applicationNameSchema } from "./schema";
import {
  getFaviconEntry,
  getFaviconFilePath,
  removeFavicon,
  saveFavicon,
} from "./favicon-storage";
import {
  getHeaderLogoEntry,
  getHeaderLogoFilePath,
  removeHeaderLogo,
  saveHeaderLogo,
} from "./header-logo-storage";

type SettingsUpdateResult =
  | { status: "success" }
  | { status: "error"; message: string };

export async function updateApplicationSettings(input: {
  appName: unknown;
  favicon: unknown;
  headerLogo: unknown;
}): Promise<SettingsUpdateResult> {
  const parsedName = applicationNameSchema.safeParse(input.appName);
  if (!parsedName.success) {
    return {
      status: "error",
      message: parsedName.error.issues[0]?.message ?? "Enter a valid website name.",
    };
  }

  const faviconEntry = getFaviconEntry(input.favicon);
  if (faviconEntry.status === "invalid") {
    return { status: "error", message: "Choose an ICO or PNG favicon smaller than 2 MB." };
  }

  const headerLogoEntry = getHeaderLogoEntry(input.headerLogo);
  if (headerLogoEntry.status === "invalid") {
    return { status: "error", message: "Choose a PNG, JPEG, or WebP header logo smaller than 2 MB." };
  }

  let newFavicon: Awaited<ReturnType<typeof saveFavicon>> | null = null;
  let newHeaderLogo: Awaited<ReturnType<typeof saveHeaderLogo>> | null = null;
  if (faviconEntry.file) {
    newFavicon = await saveFavicon(faviconEntry.file);
    if (newFavicon.status === "invalid") {
      return { status: "error", message: "The favicon must be a valid ICO or PNG image." };
    }
    if (newFavicon.status === "error") {
      return { status: "error", message: "The favicon could not be saved. Please try again." };
    }
  }
  if (headerLogoEntry.file) {
    newHeaderLogo = await saveHeaderLogo(headerLogoEntry.file);
    if (newHeaderLogo.status === "invalid") {
      if (newFavicon?.status === "success") await removeFavicon(newFavicon.filePath);
      return { status: "error", message: "The header logo must be a valid PNG, JPEG, or WebP image." };
    }
    if (newHeaderLogo.status === "error") {
      if (newFavicon?.status === "success") await removeFavicon(newFavicon.filePath);
      return { status: "error", message: "The header logo could not be saved. Please try again." };
    }
  }

  let currentSettings: Awaited<ReturnType<typeof readApplicationSettings>>;
  try {
    currentSettings = await readApplicationSettings();
    const faviconPath = newFavicon?.status === "success"
      ? newFavicon.path
      : currentSettings.faviconPath;
    const headerLogoPath = newHeaderLogo?.status === "success"
      ? newHeaderLogo.path
      : currentSettings.headerLogoPath;
    await saveApplicationSettings({
      appName: parsedName.data,
      faviconPath: faviconPath === "/favicon-default.ico" ? null : faviconPath,
      headerLogoPath,
    });
  } catch (error) {
    if (newFavicon?.status === "success") await removeFavicon(newFavicon.filePath);
    if (newHeaderLogo?.status === "success") await removeHeaderLogo(newHeaderLogo.filePath);
    throw error;
  }

  if (newFavicon?.status === "success") {
    const previousFavicon = getFaviconFilePath(currentSettings.faviconPath);
    if (previousFavicon && previousFavicon !== newFavicon.filePath) {
      await removeFavicon(previousFavicon);
    }
  }
  if (newHeaderLogo?.status === "success") {
    const previousHeaderLogo = getHeaderLogoFilePath(currentSettings.headerLogoPath);
    if (previousHeaderLogo && previousHeaderLogo !== newHeaderLogo.filePath) {
      await removeHeaderLogo(previousHeaderLogo);
    }
  }

  return { status: "success" };
}
