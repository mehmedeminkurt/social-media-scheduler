import { Prisma } from "@prisma/client";
import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { renderBrandedImage, type BrandKitData } from "@/lib/branding/engine";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { ImageValidationError, validateInstagramImage } from "@/lib/posts/image-validation";
import { resolveUploadType } from "@/lib/posts/media-types";
import { validateInstagramReelsVideo, VideoValidationError } from "@/lib/posts/video-validation";
import { prisma } from "@/lib/prisma";
import { uploadMedia } from "@/lib/storage/media";
import { TenantAccessError } from "@/lib/tenant";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_MEDIA_PER_POST = 10;
const MAX_ORDER_RETRIES = 5;

// Insert the asset with the next free order value. A unique (postId, order)
// constraint makes concurrent uploads to the same post race-safe: the loser of
// a race hits P2002 and retries with a freshly-computed order.
async function createMediaAssetWithOrder(
  postId: string,
  type: string,
  originalUrl: string,
  renderedUrl?: string | null,
): Promise<{ ok: true; asset: Awaited<ReturnType<typeof prisma.mediaAsset.create>> } | { ok: false; full: true }> {
  for (let attempt = 0; attempt <= MAX_ORDER_RETRIES; attempt++) {
    const count = await prisma.mediaAsset.count({ where: { postId } });

    if (count >= MAX_MEDIA_PER_POST) {
      return { ok: false, full: true };
    }

    try {
      const asset = await prisma.mediaAsset.create({
        data: { postId, type, originalUrl, renderedUrl: renderedUrl ?? null, order: count },
      });
      return { ok: true, asset };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < MAX_ORDER_RETRIES
      ) {
        continue;
      }
      throw error;
    }
  }

  return { ok: false, full: true };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    // Reject oversized uploads via Content-Length BEFORE buffering the whole
    // body into memory with formData() — otherwise the size check is too late.
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return apiError("Dosya boyutu 100 MB sınırını aşıyor.", 413);
    }

    await requirePostForCompany(userId, companyId, postId);

    const existingAssets = await prisma.mediaAsset.findMany({
      where: { postId },
      select: { type: true },
      orderBy: { order: "asc" },
    });

    if (existingAssets.length >= MAX_MEDIA_PER_POST) {
      return apiError("Bir gönderiye en fazla 10 adet medya eklenebilir.", 400);
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("Dosya alanı (file) gereklidir.", 400);
    }

    if (file.size === 0) {
      return apiError("Boş dosya yüklenemez.", 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError("Dosya boyutu 100 MB sınırını aşıyor.", 400);
    }

    const resolvedType = resolveUploadType(file.type);
    if (!resolvedType) {
      return apiError(
        "Desteklenmeyen dosya türü. JPEG, PNG, WebP, MP4 veya MOV yükleyin.",
        400,
      );
    }

    if (existingAssets.length > 0) {
      const existingType = existingAssets[0]?.type;
      if (existingType && existingType !== resolvedType.mediaType) {
        return apiError(
          "Görsel ve video aynı gönderide birlikte kullanılamaz.",
          400,
        );
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (resolvedType.mediaType === "image") {
      try {
        await validateInstagramImage(buffer);
      } catch (error) {
        if (error instanceof ImageValidationError) {
          return apiError(error.message, 400);
        }
        throw error;
      }
    } else {
      try {
        validateInstagramReelsVideo(buffer);
      } catch (error) {
        if (error instanceof VideoValidationError) {
          return apiError(error.message, 400);
        }
        throw error;
      }
    }

    const originalUrl = await uploadMedia(
      buffer,
      companyId,
      resolvedType.extension,
      resolvedType.contentType,
    );

    // Brand Kit rendering pipeline (images only — videos bypass)
    let renderedUrl: string | null = null;
    if (resolvedType.mediaType === "image") {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { brandKitId: true, aspectRatio: true },
      });

      if (post?.brandKitId) {
        const brandKitRecord = await prisma.brandKit.findUnique({
          where: { id: post.brandKitId },
        });

        if (brandKitRecord) {
          try {
            const brandKit: BrandKitData = {
              logoUrl: brandKitRecord.logoUrl,
              colors: brandKitRecord.colors as Record<string, string>,
              overlayConfig: brandKitRecord.overlayConfig as Record<string, unknown>,
            };
            const renderedBuffer = await renderBrandedImage(buffer, brandKit, post.aspectRatio);
            renderedUrl = await uploadMedia(renderedBuffer, companyId, "jpg", "image/jpeg");
          } catch (renderErr) {
            // Non-fatal: log and fall back to originalUrl
            console.error("Brand kit rendering failed, falling back to originalUrl:", renderErr);
          }
        }
      }
    }

    const created = await createMediaAssetWithOrder(
      postId,
      resolvedType.mediaType,
      originalUrl,
      renderedUrl,
    );

    if (!created.ok) {
      return apiError("Bir gönderiye en fazla 10 adet medya eklenebilir.", 400);
    }

    return apiSuccess(created.asset, 201);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof PostNotFoundError) {
      return apiError(error.message, 404);
    }
    console.error("POST /api/posts/[id]/media error:", error);
    return apiError("Medya yüklenirken bir hata oluştu.", 500);
  }
}
