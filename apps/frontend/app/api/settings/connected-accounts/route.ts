import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requireCompanyAccess(userId, companyId);

    // Yalnızca desteklenen platformların bağlantı durumunu döndür
    const accounts = await prisma.socialAccount.findMany({
      where: {
        companyId,
        platform: { in: ["instagram", "linkedin"] },
      },
      select: {
        platform: true,
        externalId: true,
        tokenExpiresAt: true,
        createdAt: true,
      },
    });

    return apiSuccess(accounts);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("GET connected-accounts error:", error);
    return apiError("Bağlı hesaplar alınırken bir hata oluştu.", 500);
  }
}
