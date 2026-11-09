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

type SettingsUpdateResult =
  | { status: "success" }
  | { status: "error"; message: string };

export async function updateApplicationSettings(input: {
  appName: unknown;
  favicon: unknown;
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

  let newFavicon: Awaited<ReturnType<typeof saveFavicon>> | null = null;
  if (faviconEntry.file) {
    newFavicon = await saveFavicon(faviconEntry.file);
    if (newFavicon.status === "invalid") {
      return { status: "error", message: "The favicon must be a valid ICO or PNG image." };
    }
    if (newFavicon.status === "error") {
      return { status: "error", message: "The favicon could not be saved. Please try again." };
    }
  }

  let currentSettings: Awaited<ReturnType<typeof readApplicationSettings>>;
  try {
    currentSettings = await readApplicationSettings();
    const faviconPath = newFavicon?.status === "success"
      ? newFavicon.path
      : currentSettings.faviconPath;
    await saveApplicationSettings({
      appName: parsedName.data,
      faviconPath: faviconPath === "/favicon-default.ico" ? null : faviconPath,
    });
  } catch (error) {
    if (newFavicon?.status === "success") await removeFavicon(newFavicon.filePath);
    throw error;
  }

  if (newFavicon?.status === "success") {
    const previousFavicon = getFaviconFilePath(currentSettings.faviconPath);
    if (previousFavicon && previousFavicon !== newFavicon.filePath) {
      await removeFavicon(previousFavicon);
    }
  }

  return { status: "success" };
}
