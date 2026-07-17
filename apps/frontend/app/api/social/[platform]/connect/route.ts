import { randomBytes } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

type Platform = "instagram" | "linkedin";

const SUPPORTED_PLATFORMS: Platform[] = ["instagram", "linkedin"];

const OAUTH_CONFIGS: Record<Platform, { authUrl: string; scope: string }> = {
  instagram: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    // instagram_content_publish için pages_read_engagement + pages_show_list gereklidir.
    scope:
      "instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list",
  },
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scope: "w_member_social openid profile email",
  },
};

export async function GET(
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

    // Firma erişim kontrolü
    await requireCompanyAccess(userId, companyId);

    // Platform için uygulama kimlik bilgileri kontrolü
    const appConfig = await prisma.socialAppConfig.findUnique({
      where: { companyId_platform: { companyId, platform } },
    });

    if (!appConfig) {
      return apiError(
        `${platform} platformu henüz yapılandırılmamış. Lütfen önce Ayarlar sayfasından uygulama bilgilerini girin.`,
        400,
      );
    }

    // CSRF koruması için tahmin edilemez state üret
    const state = randomBytes(32).toString("hex");

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/social/${platform}/callback`;
    const config = OAUTH_CONFIGS[platform];

    // state ve companyId'yi base64url formatında encode et
    const encodedState = Buffer.from(
      JSON.stringify({ state, companyId }),
    ).toString("base64url");

    // OAuth authorization URL'ini oluştur
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set("client_id", appConfig.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", encodedState);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", config.scope);

    const response = NextResponse.redirect(authUrl.toString());

    // State'i HTTP-only çerezde sakla (10 dk TTL, CSRF koruması)
    response.cookies.set(`oauth_state_${platform}`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 dakika
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("OAuth connect hatası:", error);
    return apiError("OAuth bağlantısı başlatılamadı.", 500);
  }
}
