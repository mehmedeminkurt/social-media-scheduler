import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";
import { validateBody } from "@/lib/validate-request";

const MASK_STRING = "••••••••••••••••";

const postSchema = z.object({
  platform: z.enum(["instagram", "linkedin"]),
  clientId: z.string().min(1, "Client ID boş olamaz."),
  clientSecret: z.string().min(1, "Client Secret boş olamaz.").optional().nullable(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    // Yetki Kontrolü
    await requireCompanyAccess(userId, companyId);

    const configs = await prisma.socialAppConfig.findMany({
      where: { companyId },
    });

    const data = configs.map((c) => ({
      platform: c.platform,
      clientId: c.clientId,
      hasSecret: !!c.clientSecretEncrypted,
    }));

    return apiSuccess(data);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("GET social-apps settings error:", error);
    return apiError("Ayarlar yüklenirken beklenmedik bir hata oluştu.", 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    // İstek Gövdesi Doğrulaması
    const body = await req.json();
    const validation = validateBody(postSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { platform, clientId, clientSecret } = validation.data;

    // Yetki Kontrolü
    await requireCompanyAccess(userId, companyId);

    const existing = await prisma.socialAppConfig.findUnique({
      where: {
        companyId_platform: { companyId, platform },
      },
    });

    let clientSecretEncrypted = existing?.clientSecretEncrypted;
    let hasChanged = false;

    if (existing) {
      const isClientIdChanged = existing.clientId !== clientId;
      const isClientSecretChanged = !!(clientSecret && clientSecret !== MASK_STRING);
      if (isClientIdChanged || isClientSecretChanged) {
        hasChanged = true;
      }
    }

    // Yeni secret girilmişse veya değiştirilmişse şifrele
    if (clientSecret && clientSecret !== MASK_STRING) {
      clientSecretEncrypted = encrypt(clientSecret);
    } else if (!clientSecretEncrypted) {
      // Eğer eski secret yoksa ve yenisi de girilmemişse hata ver
      return apiError("İstemci sırrı (Client Secret) gereklidir.", 400);
    }

    // Yapılandırma değiştiyse ilişkili eski bağlantıları temizle
    if (hasChanged) {
      await prisma.socialAccount.deleteMany({
        where: {
          companyId,
          platform,
        },
      });
    }

    const updatedConfig = await prisma.socialAppConfig.upsert({
      where: {
        companyId_platform: { companyId, platform },
      },
      update: {
        clientId,
        clientSecretEncrypted,
      },
      create: {
        companyId,
        platform,
        clientId,
        clientSecretEncrypted,
      },
    });

    return apiSuccess({
      platform: updatedConfig.platform,
      clientId: updatedConfig.clientId,
      hasSecret: true,
    });
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("POST social-apps settings error:", error);
    return apiError("Ayarlar kaydedilirken beklenmedik bir hata oluştu.", 500);
  }
}
