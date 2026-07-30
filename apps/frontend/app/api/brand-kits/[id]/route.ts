import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { brandKitSchema } from "@/lib/branding/schemas";
import { prisma } from "@/lib/prisma";
import { isStorageUrl } from "@/lib/storage/media";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";
import { validateBody } from "@/lib/validate-request";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const companyId = session.user.activeCompanyId;
    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requireCompanyAccess(session.user.id, companyId);

    // Verify BrandKit belongs to this company
    const existing = await prisma.brandKit.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return apiError("Marka seti bulunamadı.", 404);
    }

    const body = await req.json();
    const validation = validateBody(brandKitSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { name, logoUrl, colors, overlayConfig } = validation.data;

    if (logoUrl && !isStorageUrl(logoUrl)) {
      return apiError("Logo yalnızca yüklenen dosyalardan seçilebilir.", 400);
    }

    const updated = await prisma.brandKit.update({
      where: { id },
      data: {
        name,
        logoUrl: logoUrl ?? existing.logoUrl,
        colors: colors as Prisma.InputJsonValue,
        overlayConfig: overlayConfig as Prisma.InputJsonValue,
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("PUT /api/brand-kits/[id] error:", error);
    return apiError("Marka seti güncellenirken bir hata oluştu.", 500);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const companyId = session.user.activeCompanyId;
    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requireCompanyAccess(session.user.id, companyId);

    const existing = await prisma.brandKit.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return apiError("Marka seti bulunamadı.", 404);
    }

    await prisma.brandKit.delete({ where: { id } });

    return apiSuccess({ deleted: true });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("DELETE /api/brand-kits/[id] error:", error);
    return apiError("Marka seti silinirken bir hata oluştu.", 500);
  }
}
