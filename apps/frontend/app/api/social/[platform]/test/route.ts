import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { decrypt } from "@/lib/crypto";
import { META_GRAPH_API_BASE } from "@/lib/meta/graph-api";
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

    // Platform yapılandırması kontrolü
    const appConfig = await prisma.socialAppConfig.findUnique({
      where: { companyId_platform: { companyId, platform } },
    });

    if (!appConfig) {
      return apiError("Bu platform yapılandırılmamış.", 400);
    }

    // SocialAccount kaydını çek
    const socialAccount = await prisma.socialAccount.findFirst({
      where: {
        companyId,
        platform,
      },
    });

    if (!socialAccount) {
      return apiError("Bu platform için bağlı hesap bulunamadı.", 404);
    }

    const accessToken = decrypt(socialAccount.accessTokenEncrypted);

    // Platforma göre hafif doğrulama çağrısı
    if (platform === "instagram") {
      try {
        const res = await fetch(
          `${META_GRAPH_API_BASE}/me?access_token=${accessToken}`,
        );
        const data = await res.json() as { id?: string; error?: { message: string } };

        if (data.error || !data.id) {
          console.error("Meta Graph API test error:", data.error);
          return apiError(
            "Instagram (Meta) bağlantı doğrulaması başarısız. " +
            "Lütfen bağlı Instagram hesabınızın Professional (Business/Creator) " +
            "ve bir Facebook Sayfasına bağlı olduğundan emin olun.",
            400,
          );
        }
      } catch (err) {
        console.error("Meta API fetch error:", err);
        return apiError("Meta Graph API bağlantı hatası.", 500);
      }
    } else if (platform === "linkedin") {
      try {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json() as Record<string, unknown>;

        const externalId =
          typeof data.sub === "string" ? data.sub :
          typeof data.id  === "string" ? data.id  :
          undefined;

        if (!externalId) {
          console.error("LinkedIn userinfo test error:", data);
          return apiError("LinkedIn bağlantı doğrulaması başarısız.", 400);
        }
      } catch (err) {
        console.error("LinkedIn API fetch error:", err);
        return apiError("LinkedIn API bağlantı hatası.", 500);
      }
    }

    return apiSuccess({ message: "Bağlantı aktif ve geçerli." });
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("Test connection error:", error);
    return apiError("Bağlantı test edilirken beklenmedik bir hata oluştu.", 500);
  }
}
