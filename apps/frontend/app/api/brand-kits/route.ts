import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { brandKitSchema } from "@/lib/branding/schemas";
import { prisma } from "@/lib/prisma";
import { isStorageUrl } from "@/lib/storage/media";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";
import { validateBody } from "@/lib/validate-request";

export async function GET() {
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

    const brandKits = await prisma.brandKit.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(brandKits);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("GET /api/brand-kits error:", error);
    return apiError("Marka setleri listelenirken bir hata oluştu.", 500);
  }
}

export async function POST(req: Request) {
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

    const body = await req.json();
    const validation = validateBody(brandKitSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { name, logoUrl, colors, overlayConfig } = validation.data;

    if (logoUrl && !isStorageUrl(logoUrl)) {
      return apiError("Logo yalnızca yüklenen dosyalardan seçilebilir.", 400);
    }

    const brandKit = await prisma.brandKit.create({
      data: {
        companyId,
        name,
        logoUrl: logoUrl || null,
        colors: colors as Prisma.InputJsonValue,
        overlayConfig: overlayConfig as Prisma.InputJsonValue,
      },
    });

    return apiSuccess(brandKit, 201);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("POST /api/brand-kits error:", error);
    return apiError("Marka seti oluşturulurken bir hata oluştu.", 500);
  }
}
