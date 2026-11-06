import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const maxLogoSize = 2 * 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "master-data");
const logoEntrySchema = z.union([z.instanceof(File), z.null()]);

function getImageFormat(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (isPng) return { extension: "png", mimeType: "image/png" };
  if (isJpeg) return { extension: "jpg", mimeType: "image/jpeg" };
  if (isWebp) return { extension: "webp", mimeType: "image/webp" };
  return null;
}

export function getLogoEntry(formData: FormData) {
  const parsed = logoEntrySchema.safeParse(formData.get("logo"));
  if (!parsed.success) return { status: "invalid" as const };
  const entry = parsed.data;
  if (!entry || entry.size === 0) return { status: "valid" as const, file: null };
  if (entry.size > maxLogoSize) return { status: "invalid" as const };

  return { status: "valid" as const, file: entry };
}

export async function saveLogo(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageFormat = getImageFormat(bytes);
  if (!imageFormat || (file.type && file.type !== imageFormat.mimeType)) {
    return { status: "invalid" as const };
  }

  const fileName = `${randomUUID()}.${imageFormat.extension}`;
  const filePath = path.join(uploadDirectory, fileName);
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(filePath, bytes, { flag: "wx" });
    return {
      status: "success" as const,
      path: `/uploads/master-data/${fileName}`,
      filePath,
    };
  } catch (error) {
    console.error("Failed to save a product category or brand logo.", error);
    return { status: "error" as const };
  }
}

export async function removeLogo(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Failed to remove an unused category or brand logo.", error);
  }
}

export function getLogoFilePath(logo: string | null) {
  if (!logo?.startsWith("/uploads/master-data/")) return null;
  return path.join(uploadDirectory, path.basename(logo));
}
