import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const maxFaviconSize = 2 * 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "settings");

export function getFaviconEntry(entry: unknown) {
  if (!(entry instanceof File)) return { status: "invalid" as const };
  if (entry.size === 0) return { status: "valid" as const, file: null };
  if (entry.size > maxFaviconSize) return { status: "invalid" as const };
  return { status: "valid" as const, file: entry };
}

export function getFaviconFormat(bytes: Uint8Array) {
  const pngDimensions = bytes.length >= 24
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : null;
  const isPng =
    pngDimensions !== null &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" &&
    pngDimensions.getUint32(16) > 0 &&
    pngDimensions.getUint32(20) > 0;
  if (isPng) return { extension: "png", mimeType: "image/png" };

  const isIco =
    bytes.length >= 22 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    bytes[2] === 1 &&
    bytes[3] === 0 &&
    bytes[4] > 0;
  if (isIco) return { extension: "ico", mimeType: "image/x-icon" };

  return null;
}

export async function saveFavicon(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = getFaviconFormat(bytes);
  if (!format || (file.type && file.type !== format.mimeType && file.type !== "image/vnd.microsoft.icon")) {
    return { status: "invalid" as const };
  }

  const fileName = `${randomUUID()}.${format.extension}`;
  const filePath = path.join(uploadDirectory, fileName);
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(filePath, bytes, { flag: "wx" });
    return {
      status: "success" as const,
      path: `/uploads/settings/${fileName}`,
      filePath,
    };
  } catch (error) {
    console.error("Failed to save the application favicon.", error);
    return { status: "error" as const };
  }
}

export function getFaviconFilePath(faviconPath: string | null) {
  if (!faviconPath?.startsWith("/uploads/settings/")) return null;
  return path.join(uploadDirectory, path.basename(faviconPath));
}

export async function removeFavicon(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Failed to remove a replaced application favicon.", error);
  }
}
