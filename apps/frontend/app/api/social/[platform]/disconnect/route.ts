import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

type Platform = "instagram" | "linkedin";

const SUPPORTED_PLATFORMS: Platform[] = ["instagram", "linkedin"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform: rawPlatform } = await params;

    if (!SUPPORTED_PLATFORMS.includes(rawPlatform as Platform)) {
      return apiError("Desteklenmeyen platform.", 400);
    }

    const platform = rawPlatform as Platform;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    // Yetki Kontrolü
    await requireCompanyAccess(userId, companyId);

    // SocialAccount kaydını sil
    const deleteResult = await prisma.socialAccount.deleteMany({
      where: {
        companyId,
        platform,
      },
    });

    if (deleteResult.count === 0) {
      return apiError("Bağlı hesap bulunamadı.", 404);
    }

    return apiSuccess({ message: "Bağlantı başarıyla kesildi." });
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("Disconnect error:", error);
    return apiError("Bağlantı kesilirken beklenmedik bir hata oluştu.", 500);
  }
}
