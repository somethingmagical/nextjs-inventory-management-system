type ResolveProductImageOrderInput = {
  order: string[];
  existingImages: string[];
  removedImages: string[];
  newImageIds: string[];
  uploadedImagePaths: string[];
};

const imageIdPattern = /^new:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export function resolveProductImageOrder({
  order,
  existingImages,
  removedImages,
  newImageIds,
  uploadedImagePaths,
}: ResolveProductImageOrderInput): string[] | null {
  if (
    newImageIds.length !== uploadedImagePaths.length
    || newImageIds.some((id) => !imageIdPattern.test(id))
    || new Set(newImageIds).size !== newImageIds.length
  ) {
    return null;
  }

  const removed = new Set(removedImages);
  const retainedImages = existingImages.filter((image) => !removed.has(image));
  const imagePathByKey = new Map([
    ...retainedImages.map((image) => [`existing:${image}`, image] as const),
    ...newImageIds.map((id, index) => [id, uploadedImagePaths[index]] as const),
  ]);
  const expectedKeys = new Set(imagePathByKey.keys());

  if (
    imagePathByKey.size > 10
    || order.length !== expectedKeys.size
    || new Set(order).size !== order.length
    || order.some((key) => !expectedKeys.has(key))
  ) {
    return null;
  }

  const orderedImages = order.map((key) => imagePathByKey.get(key));
  if (orderedImages.some((image) => image === undefined)) return null;
  return orderedImages.filter((image): image is string => image !== undefined);
}
