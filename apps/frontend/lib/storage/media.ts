import { randomUUID } from "crypto";

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { s3BucketName, s3Client, s3PublicBaseUrl } from "@/lib/storage/client";

export class StorageUrlError extends Error {
  constructor(message = "URL does not belong to configured storage.") {
    super(message);
    this.name = "StorageUrlError";
  }
}

export function deriveKeyFromUrl(url: string): string {
  const prefix = `${s3PublicBaseUrl}/`;

  if (!url.startsWith(prefix)) {
    throw new StorageUrlError();
  }

  const key = url.slice(prefix.length);

  if (!key) {
    throw new StorageUrlError("Storage key is empty.");
  }

  return key;
}

export function buildPublicUrl(key: string): string {
  return `${s3PublicBaseUrl}/${key}`;
}

/**
 * True only for URLs served from our configured object storage. Used to gate any
 * server-side fetch of a user-supplied URL (e.g. a brand-kit logo) so it can't be
 * pointed at internal hosts / cloud metadata endpoints (SSRF).
 */
export function isStorageUrl(url: string): boolean {
  return url.startsWith(`${s3PublicBaseUrl}/`);
}

export async function uploadMedia(
  buffer: Buffer,
  companyId: string,
  extension: string,
  contentType: string,
): Promise<string> {
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase();
  const key = `${companyId}/${randomUUID()}.${normalizedExtension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return buildPublicUrl(key);
}

export async function deleteMedia(url: string): Promise<void> {
  const key = deriveKeyFromUrl(url);

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3BucketName,
      Key: key,
    }),
  );
}
