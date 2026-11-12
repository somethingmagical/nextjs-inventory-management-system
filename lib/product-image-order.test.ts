import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductImageOrder } from "./product-image-order";

const newImageId = "new:123e4567-e89b-42d3-a456-426614174000";

test("resolves reordered existing and uploaded images in the submitted order", () => {
  assert.deepEqual(
    resolveProductImageOrder({
      order: [newImageId, "existing:/uploads/products/first.png", "existing:/uploads/products/second.png"],
      existingImages: ["/uploads/products/first.png", "/uploads/products/second.png"],
      removedImages: [],
      newImageIds: [newImageId],
      uploadedImagePaths: ["/uploads/products/new.png"],
    }),
    [
      "/uploads/products/new.png",
      "/uploads/products/first.png",
      "/uploads/products/second.png",
    ],
  );
});

test("excludes removed existing images when resolving order", () => {
  assert.deepEqual(
    resolveProductImageOrder({
      order: [newImageId],
      existingImages: ["/uploads/products/first.png"],
      removedImages: ["/uploads/products/first.png"],
      newImageIds: [newImageId],
      uploadedImagePaths: ["/uploads/products/new.png"],
    }),
    ["/uploads/products/new.png"],
  );
});

test("rejects duplicated, missing, or unknown image order keys", () => {
  const input = {
    existingImages: ["/uploads/products/first.png"],
    removedImages: [],
    newImageIds: [],
    uploadedImagePaths: [],
  };

  assert.equal(resolveProductImageOrder({ ...input, order: [] }), null);
  assert.equal(
    resolveProductImageOrder({
      ...input,
      order: ["existing:/uploads/products/first.png", "existing:/uploads/products/first.png"],
    }),
    null,
  );
  assert.equal(resolveProductImageOrder({ ...input, order: ["existing:/uploads/products/other.png"] }), null);
});

test("rejects invalid upload IDs or mismatched upload lists", () => {
  assert.equal(
    resolveProductImageOrder({
      order: ["new:not-a-uuid"],
      existingImages: [],
      removedImages: [],
      newImageIds: ["new:not-a-uuid"],
      uploadedImagePaths: ["/uploads/products/new.png"],
    }),
    null,
  );
  assert.equal(
    resolveProductImageOrder({
      order: [newImageId],
      existingImages: [],
      removedImages: [],
      newImageIds: [newImageId],
      uploadedImagePaths: [],
    }),
    null,
  );
});
