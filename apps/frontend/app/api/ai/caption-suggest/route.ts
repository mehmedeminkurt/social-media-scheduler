import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { suggestCaption } from "@/lib/ai/caption-suggest";
import { captionSuggestSchema } from "@/lib/ai/schemas";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";
import { validateBody } from "@/lib/validate-request";

export async function POST(req: Request) {
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

    const body = await req.json();
    const validation = validateBody(captionSuggestSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { topic, platforms, brandKitId, mediaHint } = validation.data;

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true },
    });

    let brandKitName: string | null = null;
    if (brandKitId) {
      const brandKit = await prisma.brandKit.findFirst({
        where: { id: brandKitId, companyId },
        select: { name: true },
      });
      if (!brandKit) {
        return apiError("Marka seti bulunamadı veya bu şirkete ait değil.", 404);
      }
      brandKitName = brandKit.name;
    }

    const result = await suggestCaption({
      companyName: company.name,
      brandKitName,
      topic,
      platforms,
      mediaHint,
    });

    return apiSuccess(result);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof Error && error.message === "AI servisi yapılandırılmamış.") {
      return apiError("AI önerisi şu an kullanılamıyor. Yöneticinize başvurun.", 503);
    }
    console.error("POST /api/ai/caption-suggest error:", error);
    return apiError("AI önerisi oluşturulurken bir hata oluştu.", 500);
  }
}
