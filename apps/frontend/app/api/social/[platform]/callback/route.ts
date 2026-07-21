import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  LINKEDIN_ORG_URN_PREFIX,
  linkedInHeaders,
  LINKEDIN_REST_BASE,
} from "@/lib/linkedin/api";
import { META_GRAPH_API_BASE } from "@/lib/meta/graph-api";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

type Platform = "instagram" | "linkedin";

const SUPPORTED_PLATFORMS: Platform[] = ["instagram", "linkedin"];

// ─── Instagram ────────────────────────────────────────────────────────────────

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; name: string };
}

async function handleInstagramCallback(
  code: string,
  clientId: string,
  clientSecretEncrypted: string,
  redirectUri: string,
  companyId: string,
): Promise<void> {
  const clientSecret = decrypt(clientSecretEncrypted);

  // 1. Kısa ömürlü user token al (code → short-lived token)
  const shortRes = await fetch(
    `${META_GRAPH_API_BASE}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    },
  );
  const shortData = await shortRes.json() as { access_token?: string; error?: { message: string } };
  if (shortData.error || !shortData.access_token) {
    throw new Error(shortData.error?.message ?? "Kısa ömürlü token alınamadı.");
  }

  // 2. Uzun ömürlü user token al (60 gün)
  const llRes = await fetch(
    `${META_GRAPH_API_BASE}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortData.access_token,
    }),
  );
  const llData = await llRes.json() as { access_token?: string; error?: { message: string } };
  if (llData.error || !llData.access_token) {
    throw new Error(llData.error?.message ?? "Uzun ömürlü token alınamadı.");
  }
  const longLivedUserToken = llData.access_token;

  // 3. Kullanıcının Facebook Sayfalarını ve bağlı Instagram hesabını çek
  const pagesRes = await fetch(
    `${META_GRAPH_API_BASE}/me/accounts?` +
    new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,name}",
      access_token: longLivedUserToken,
    }),
  );
  const pagesData = await pagesRes.json() as {
    data?: MetaPage[];
    error?: { message: string };
  };

  if (pagesData.error) {
    throw new Error(pagesData.error.message ?? "Sayfa listesi alınamadı.");
  }

  const pages = pagesData.data ?? [];

  // Instagram Professional (Business/Creator) hesabı olan ilk sayfayı bul
  const eligiblePage = pages.find((p) => p.instagram_business_account?.id);

  if (!eligiblePage?.instagram_business_account) {
    // Modül 4'te daha ayrıntılı ele alınacak; şimdi özel bir hata kodu fırlat
    throw new Error("INSTAGRAM_NO_PROFESSIONAL_ACCOUNT");
  }

  const instagramExternalId = eligiblePage.instagram_business_account.id;

  // ⬇️  Sayfa bazlı access_token şifreleniyor (kullanıcı token'ı değil!)
  const encryptedPageToken = encrypt(eligiblePage.access_token);

  await prisma.socialAccount.upsert({
    where: {
      companyId_platform_externalId: {
        companyId,
        platform: "instagram",
        externalId: instagramExternalId,
      },
    },
    update: {
      accessTokenEncrypted: encryptedPageToken,
      tokenExpiresAt: null, // Sayfa token'ları kullanıcı token'ı geçerli olduğu sürece çalışır
    },
    create: {
      companyId,
      platform: "instagram",
      externalId: instagramExternalId,
      accessTokenEncrypted: encryptedPageToken,
      tokenExpiresAt: null,
    },
  });
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

interface OrganizationAclElement {
  organization?: string;
  role?: string;
  state?: string;
}

interface OrganizationAclsResponse {
  elements?: OrganizationAclElement[];
  message?: string;
}

function extractOrganizationId(organizationUrn: string): string | undefined {
  if (!organizationUrn.startsWith(LINKEDIN_ORG_URN_PREFIX)) {
    return undefined;
  }

  const orgId = organizationUrn.slice(LINKEDIN_ORG_URN_PREFIX.length);
  return orgId.length > 0 ? orgId : undefined;
}

async function fetchLinkedInOrganizationId(accessToken: string): Promise<string> {
  const url = new URL(`${LINKEDIN_REST_BASE}/organizationAcls`);
  url.searchParams.set("q", "roleAssignee");
  url.searchParams.set("role", "ADMINISTRATOR");

  const response = await fetch(url, {
    headers: linkedInHeaders(accessToken),
  });

  const body = (await response.json()) as OrganizationAclsResponse;

  if (!response.ok) {
    throw new Error(body.message ?? "LinkedIn organizasyon listesi alınamadı.");
  }

  const organizationUrn = body.elements?.find(
    (element) =>
      element.state === "APPROVED" &&
      typeof element.organization === "string" &&
      element.organization.startsWith(LINKEDIN_ORG_URN_PREFIX),
  )?.organization;

  if (!organizationUrn) {
    throw new Error("LINKEDIN_NO_ORGANIZATION");
  }

  const organizationId = extractOrganizationId(organizationUrn);
  if (!organizationId) {
    throw new Error("LINKEDIN_NO_ORGANIZATION");
  }

  return organizationId;
}

async function handleLinkedInCallback(
  code: string,
  clientId: string,
  clientSecretEncrypted: string,
  redirectUri: string,
  companyId: string,
): Promise<void> {
  const clientSecret = decrypt(clientSecretEncrypted);

  // 1. Authorization code → access token
  const tokenRes = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    },
  );
  const tokenData = await tokenRes.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? "LinkedIn token alınamadı.");
  }

  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in ?? 5184000; // varsayılan 60 gün

  // 2. Yönetici olunan organizasyonu al (author = urn:li:organization:{id})
  const organizationId = await fetchLinkedInOrganizationId(accessToken);

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  // Eski bağlantıları temizle — externalId artık org id olacak
  await prisma.socialAccount.deleteMany({
    where: { companyId, platform: "linkedin" },
  });

  await prisma.socialAccount.create({
    data: {
      companyId,
      platform: "linkedin",
      externalId: organizationId,
      accessTokenEncrypted: encrypt(accessToken),
      tokenExpiresAt,
    },
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: rawPlatform } = await params;
  const settingsUrl = new URL("/settings", req.nextUrl.origin);

  // Hata durumunda çerezi temizleyip settings'e yönlendiren yardımcı
  const redirectError = (message: string) => {
    settingsUrl.searchParams.set("error", message);
    settingsUrl.searchParams.set("platform", rawPlatform);
    const res = NextResponse.redirect(settingsUrl.toString());
    res.cookies.set(`oauth_state_${rawPlatform}`, "", {
      maxAge: 0,
      path: "/",
    });
    return res;
  };

  try {
    if (!SUPPORTED_PLATFORMS.includes(rawPlatform as Platform)) {
      return redirectError("Desteklenmeyen platform.");
    }

    const platform = rawPlatform as Platform;
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const stateFromQuery = searchParams.get("state");
    const errorFromPlatform = searchParams.get("error");

    // Platform tarafı hata (kullanıcı izin vermedi vs.)
    if (errorFromPlatform) {
      return redirectError(
        "Kullanıcı izin vermedi veya platform tarafında bir hata oluştu.",
      );
    }

    if (!code || !stateFromQuery) {
      return redirectError("Geçersiz callback isteği (code veya state eksik).");
    }

    // ── CSRF Doğrulaması & State Çözümleme ─────────────────────────────────────
    let parsedState = stateFromQuery;
    let stateCompanyId: string | null = null;

    try {
      const decoded = JSON.parse(
        Buffer.from(stateFromQuery, "base64url").toString("utf8"),
      );
      if (decoded && typeof decoded === "object") {
        if ("state" in decoded && typeof decoded.state === "string") {
          parsedState = decoded.state;
        }
        if ("companyId" in decoded && typeof decoded.companyId === "string") {
          stateCompanyId = decoded.companyId;
        }
      }
    } catch {
      // JSON formatında değilse fallback olarak ham stateFromQuery değerini kullanıyoruz
    }

    const cookieName = `oauth_state_${platform}`;
    const stateFromCookie = req.cookies.get(cookieName)?.value;

    if (!stateFromCookie || stateFromCookie !== parsedState) {
      return redirectError(
        "Güvenlik doğrulaması başarısız (state uyuşmuyor). Lütfen tekrar deneyin.",
      );
    }

    // ── Oturum & Yetki Kontrolü ───────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return redirectError("Oturum süresi dolmuş. Lütfen tekrar giriş yapın.");
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return redirectError("Aktif şirket bulunamadı.");
    }

    if (stateCompanyId && stateCompanyId !== companyId) {
      return redirectError("Şirket kimliği eşleşmiyor. Lütfen tekrar deneyin.");
    }

    await requireCompanyAccess(userId, companyId);

    // ── Platform App Konfigürasyonu ───────────────────────────────────────────
    const appConfig = await prisma.socialAppConfig.findUnique({
      where: { companyId_platform: { companyId, platform } },
    });

    if (!appConfig) {
      return redirectError("Platform yapılandırması bulunamadı.");
    }

    const redirectUri = `${req.nextUrl.origin}/api/social/${platform}/callback`;

    // ── Platform'a Özgü Token Akışı ───────────────────────────────────────────
    if (platform === "instagram") {
      await handleInstagramCallback(
        code,
        appConfig.clientId,
        appConfig.clientSecretEncrypted,
        redirectUri,
        companyId,
      );
    } else {
      await handleLinkedInCallback(
        code,
        appConfig.clientId,
        appConfig.clientSecretEncrypted,
        redirectUri,
        companyId,
      );
    }

    // ── Başarı: State çerezini temizle, settings'e yönlendir ─────────────────
    settingsUrl.searchParams.set("connected", platform);
    settingsUrl.searchParams.set("platform", platform);
    const successRes = NextResponse.redirect(settingsUrl.toString());
    successRes.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
    return successRes;
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return redirectError(error.message);
    }

    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata";

    // Instagram Professional hesabı yok — kullanıcıya anlaşılır mesaj
    if (message === "INSTAGRAM_NO_PROFESSIONAL_ACCOUNT") {
      return redirectError(
        "Bağlı bir Instagram Professional (Business/Creator) hesabı bulunamadı. " +
        "Kişisel hesaplar desteklenmemektedir. " +
        "Lütfen hesabınızı bir Facebook Sayfasına bağlayıp Business/Creator hesabına geçirin.",
      );
    }

    if (message === "LINKEDIN_NO_ORGANIZATION") {
      return redirectError(
        "Yönetici olduğunuz bir LinkedIn organizasyonu bulunamadı. " +
        "Community Management API onayı ve w_organization_social kapsamı gereklidir.",
      );
    }

    console.error(`[OAuth callback] [${rawPlatform}] Beklenmedik hata:`, error);
    return redirectError(
      "Hesap bağlanırken bir hata oluştu. Lütfen tekrar deneyin.",
    );
  }
}
