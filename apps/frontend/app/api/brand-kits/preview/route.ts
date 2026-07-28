import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError } from "@/lib/api-response-server";
import { renderBrandedImage, type BrandKitData } from "@/lib/branding/engine";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const previewQuerySchema = z.object({
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).optional().nullable(),
  brandKitId: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const companyId = session.user.activeCompanyId;
    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requireCompanyAccess(session.user.id, companyId);

    const formData = await req.formData();
    const file = formData.get("image");
    const brandKitIdParam = formData.get("brandKitId") as string | null;
    const aspectRatioParam = formData.get("aspectRatio") as string | null;

    if (!(file instanceof File)) {
      return apiError("Görsel dosyası (image) gereklidir.", 400);
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return apiError("Desteklenmeyen format. JPEG, PNG veya WebP yükleyin.", 400);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiError("Dosya boyutu 20 MB sınırını aşıyor.", 400);
    }

    const aspectRatio = (aspectRatioParam && ["1:1", "4:5", "9:16"].includes(aspectRatioParam))
      ? aspectRatioParam
      : null;

    // Resolve brand kit
    let brandKit: BrandKitData | null = null;

    if (brandKitIdParam) {
      const kit = await prisma.brandKit.findFirst({
        where: { id: brandKitIdParam, companyId },
      });

      if (!kit) {
        return apiError("Marka seti bulunamadı.", 404);
      }

      brandKit = {
        logoUrl: kit.logoUrl,
        colors: kit.colors as Record<string, string>,
        overlayConfig: kit.overlayConfig as Record<string, unknown>,
      };
    } else {
      // Allow inline brand kit data for live preview before saving
      const colorsParam = formData.get("colors");
      const overlayConfigParam = formData.get("overlayConfig");
      const logoUrlParam = formData.get("logoUrl") as string | null;

      if (colorsParam && overlayConfigParam) {
        try {
          brandKit = {
            logoUrl: logoUrlParam || null,
            colors: JSON.parse(colorsParam as string),
            overlayConfig: JSON.parse(overlayConfigParam as string),
          };
        } catch {
          return apiError("Geçersiz colors veya overlayConfig JSON.", 400);
        }
      }
    }

    if (!brandKit) {
      return apiError("brandKitId veya ham marka verisi (colors + overlayConfig) gereklidir.", 400);
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const renderedBuffer = await renderBrandedImage(imageBuffer, brandKit, aspectRatio);

    return new NextResponse(new Uint8Array(renderedBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(renderedBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("POST /api/brand-kits/preview error:", error);
    return apiError("Önizleme oluşturulurken bir hata oluştu.", 500);
  }
}
