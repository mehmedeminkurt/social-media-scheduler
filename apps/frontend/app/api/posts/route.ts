import { PostStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { createPostSchema } from "@/lib/posts/schemas";
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

    const body = await req.json();
    const validation = validateBody(createPostSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { caption, platforms, scheduledAt } = validation.data;

    await requireCompanyAccess(userId, companyId);

    const connectedAccounts = await prisma.socialAccount.findMany({
      where: {
        companyId,
        platform: { in: platforms },
      },
      select: { platform: true },
    });

    const connectedPlatforms = new Set(connectedAccounts.map((account) => account.platform));
    const missingPlatforms = platforms.filter((platform) => !connectedPlatforms.has(platform));

    if (missingPlatforms.length > 0) {
      return apiError(
        `Bağlı hesap bulunamayan platformlar: ${missingPlatforms.join(", ")}`,
        400,
      );
    }

    const post = await prisma.post.create({
      data: {
        companyId,
        authorId: userId,
        caption,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: PostStatus.DRAFT,
        targets: {
          create: platforms.map((platform) => ({
            platform,
            status: PostStatus.DRAFT,
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    return apiSuccess(post, 201);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("POST /api/posts error:", error);
    return apiError("Gönderi oluşturulurken bir hata oluştu.", 500);
  }
}

export async function GET(req: Request) {
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

    const posts = await prisma.post.findMany({
      where: { companyId },
      include: {
        mediaAssets: {
          select: { id: true },
        },
        targets: {
          select: { platform: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const postsWithMediaCount = posts.map((post) => ({
      id: post.id,
      caption: post.caption,
      status: post.status,
      createdAt: post.createdAt,
      mediaCount: post.mediaAssets.length,
      targets: post.targets.map((target) => ({
        platform: target.platform,
        status: target.status,
      })),
    }));

    return apiSuccess(postsWithMediaCount);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("GET /api/posts error:", error);
    return apiError("Gönderiler listelenirken bir hata oluştu.", 500);
  }
}

