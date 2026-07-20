import sharp from "sharp";

/** Instagram feed: 4:5 (portrait) through 1.91:1 (landscape) */
const MIN_ASPECT_RATIO = 0.8;
const MAX_ASPECT_RATIO = 1.91;
const MIN_DIMENSION = 320;

const SUPPORTED_IMAGE_FORMATS = new Set(["jpeg", "jpg", "png", "webp"]);

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export async function validateInstagramImage(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  let metadata: sharp.Metadata;

  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new ImageValidationError("Geçersiz görsel dosyası.");
  }

  const { width, height, format } = metadata;

  if (!width || !height) {
    throw new ImageValidationError("Görsel boyutları okunamadı.");
  }

  if (!format || !SUPPORTED_IMAGE_FORMATS.has(format)) {
    throw new ImageValidationError(
      "Desteklenmeyen görsel formatı. JPEG, PNG veya WebP kullanın.",
    );
  }

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new ImageValidationError(
      `Görsel en az ${MIN_DIMENSION}x${MIN_DIMENSION} piksel olmalıdır.`,
    );
  }

  const aspectRatio = width / height;
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
    throw new ImageValidationError(
      "Görsel en-boy oranı Instagram için uygun değil (4:5 ile 1.91:1 arasında olmalıdır).",
    );
  }

  return { width, height };
}
