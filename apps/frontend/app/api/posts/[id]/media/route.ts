import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { ImageValidationError, validateInstagramImage } from "@/lib/posts/image-validation";
import { resolveUploadType } from "@/lib/posts/media-types";
import { prisma } from "@/lib/prisma";
import { uploadMedia } from "@/lib/storage/media";
import { TenantAccessError } from "@/lib/tenant";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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

    await requirePostForCompany(userId, companyId, postId);

    const existingCount = await prisma.mediaAsset.count({
      where: { postId },
    });

    if (existingCount >= 10) {
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
    }

    const originalUrl = await uploadMedia(
      buffer,
      companyId,
      resolvedType.extension,
      resolvedType.contentType,
    );

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        postId,
        type: resolvedType.mediaType,
        originalUrl,
        order: existingCount,
      },
    });

    return apiSuccess(mediaAsset, 201);
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
