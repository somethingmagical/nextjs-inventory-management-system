import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const maxImageSize = 2 * 1024 * 1024;
const maxImages = 10;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "products");
const imageFileSchema = z.instanceof(File);

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

export function getProductImageEntries(formData: FormData) {
  const parsed = z.array(imageFileSchema).max(maxImages).safeParse(formData.getAll("images"));
  if (!parsed.success || parsed.data.some((file) => file.size > maxImageSize)) {
    return { status: "invalid" as const };
  }
  return { status: "valid" as const, files: parsed.data.filter((file) => file.size > 0) };
}

export async function saveProductImages(files: File[]) {
  const saved: { path: string; filePath: string }[] = [];

  try {
    await mkdir(uploadDirectory, { recursive: true });

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const imageFormat = getImageFormat(bytes);
      if (!imageFormat || (file.type && file.type !== imageFormat.mimeType)) {
        await removeProductImages(saved.map((image) => image.path));
        return { status: "invalid" as const };
      }

      const fileName = `${randomUUID()}.${imageFormat.extension}`;
      const filePath = path.join(uploadDirectory, fileName);
      await writeFile(filePath, bytes, { flag: "wx" });
      saved.push({ path: `/uploads/products/${fileName}`, filePath });
    }

    return { status: "success" as const, images: saved };
  } catch (error) {
    await removeProductImages(saved.map((image) => image.path));
    console.error("Failed to save product images.", error);
    return { status: "error" as const };
  }
}

export async function removeProductImages(paths: string[]) {
  await Promise.all(paths.map(async (imagePath) => {
    const filePath = getProductImageFilePath(imagePath);
    if (!filePath) return;
    try {
      await unlink(filePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      console.error("Failed to remove a product image.", error);
    }
  }));
}

export function getProductImageFilePath(imagePath: string) {
  if (!imagePath.startsWith("/uploads/products/")) return null;
  return path.join(uploadDirectory, path.basename(imagePath));
}

export function getProductImagePaths(value: unknown) {
  const parsed = z.array(z.string().trim().min(1).max(512)).safeParse(value);
  return parsed.success ? parsed.data : [];
}
