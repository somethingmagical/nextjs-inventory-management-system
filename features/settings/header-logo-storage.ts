import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const maxHeaderLogoSize = 2 * 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "settings");

export function getHeaderLogoEntry(entry: unknown) {
  if (!(entry instanceof File)) return { status: "invalid" as const };
  if (entry.size === 0) return { status: "valid" as const, file: null };
  if (entry.size > maxHeaderLogoSize) return { status: "invalid" as const };
  return { status: "valid" as const, file: entry };
}

export function getHeaderLogoFormat(bytes: Uint8Array) {
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

  const isJpeg = bytes.length >= 4 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { extension: "jpg", mimeType: "image/jpeg" };

  const isWebp = bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (isWebp) return { extension: "webp", mimeType: "image/webp" };

  return null;
}

export async function saveHeaderLogo(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = getHeaderLogoFormat(bytes);
  if (!format || (file.type && file.type !== format.mimeType)) {
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
    console.error("Failed to save the application header logo.", error);
    return { status: "error" as const };
  }
}

export function getHeaderLogoFilePath(headerLogoPath: string | null) {
  if (!headerLogoPath?.startsWith("/uploads/settings/")) return null;
  return path.join(uploadDirectory, path.basename(headerLogoPath));
}

export async function removeHeaderLogo(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Failed to remove a replaced application header logo.", error);
  }
}
