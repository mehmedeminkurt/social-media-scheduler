import { PostStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { publishPostToTargets } from "@/lib/posts/publish-post";
import { prisma } from "@/lib/prisma";
import { TenantAccessError } from "@/lib/tenant";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;

    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requirePostForCompany(userId, companyId, postId);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        targets: true,
        mediaAssets: true,
      },
    });

    if (!post) {
      return apiError("Gönderi bulunamadı.", 404);
    }

    if (post.status === PostStatus.PUBLISHING) {
      return apiError("Gönderi zaten yayınlanıyor.", 409);
    }

    if (post.status === PostStatus.PUBLISHED) {
      return apiError("Gönderi zaten yayınlandı.", 409);
    }

    if (post.targets.length === 0) {
      return apiError("Yayınlanacak platform hedefi bulunamadı.", 400);
    }

    if (post.mediaAssets.length === 0) {
      return apiError("Yayınlamak için en az bir medya yükleyin.", 400);
    }

    const result = await publishPostToTargets(postId);

    const updatedPost = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        targets: true,
        mediaAssets: true,
        logs: {
          orderBy: { ts: "desc" },
          take: 10,
        },
      },
    });

    return apiSuccess({
      post: updatedPost,
      publishResult: result,
    });
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof PostNotFoundError) {
      return apiError(error.message, 404);
    }
    console.error("POST /api/posts/[id]/publish error:", error);
    return apiError("Gönderi yayınlanırken bir hata oluştu.", 500);
  }
}
