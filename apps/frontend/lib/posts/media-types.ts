const IMAGE_MIME_TYPES: Record<string, { extension: string; mediaType: "image" }> = {
  "image/jpeg": { extension: "jpg", mediaType: "image" },
  "image/png": { extension: "png", mediaType: "image" },
  "image/webp": { extension: "webp", mediaType: "image" },
};

const VIDEO_MIME_TYPES: Record<string, { extension: string; mediaType: "video" }> = {
  "video/mp4": { extension: "mp4", mediaType: "video" },
  "video/quicktime": { extension: "mov", mediaType: "video" },
};

export type ResolvedUploadType = {
  extension: string;
  mediaType: "image" | "video";
  contentType: string;
};

export function resolveUploadType(mimeType: string): ResolvedUploadType | null {
  const image = IMAGE_MIME_TYPES[mimeType];
  if (image) {
    return { ...image, contentType: mimeType };
  }

  const video = VIDEO_MIME_TYPES[mimeType];
  if (video) {
    return { ...video, contentType: mimeType };
  }

  return null;
}
