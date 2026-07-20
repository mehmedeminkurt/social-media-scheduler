const MAX_REELS_BYTES = 100 * 1024 * 1024;

export class VideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoValidationError";
  }
}

function isMp4OrMov(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  const brand = buffer.subarray(4, 8).toString("ascii");
  return brand === "ftyp";
}

export function validateInstagramReelsVideo(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new VideoValidationError("Boş video dosyası yüklenemez.");
  }

  if (buffer.length > MAX_REELS_BYTES) {
    throw new VideoValidationError("Reels videosu en fazla 100 MB olabilir.");
  }

  if (!isMp4OrMov(buffer)) {
    throw new VideoValidationError(
      "Geçersiz video dosyası. Instagram Reels için MP4 veya MOV kullanın.",
    );
  }
}
