import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const maxImageSize = 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "users");

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

export async function saveUserImage(file: File) {
  if (file.size > maxImageSize) {
    return { status: "error" as const, message: "Choose an image smaller than 1 MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageFormat = getImageFormat(bytes);
  if (!imageFormat || (file.type && file.type !== imageFormat.mimeType)) {
    return { status: "error" as const, message: "Choose a PNG, JPEG, or WebP image." };
  }

  const fileName = `${randomUUID()}.${imageFormat.extension}`;
  const filePath = path.join(uploadDirectory, fileName);
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(filePath, bytes, { flag: "wx" });
    return { status: "success" as const, path: `/uploads/users/${fileName}`, filePath };
  } catch (error) {
    console.error("Failed to save the uploaded user image.", error);
    return { status: "error" as const, message: "The image could not be uploaded. Please try again." };
  }
}

export async function removeUserImage(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Failed to remove an unused user image.", error);
  }
}

export function getUserImageEntry(formData: FormData) {
  const entry = formData.get("image");
  if (entry !== null && !(entry instanceof File)) return { status: "invalid" as const };
  return {
    status: "valid" as const,
    file: entry instanceof File && entry.size > 0 ? entry : null,
  };
}
