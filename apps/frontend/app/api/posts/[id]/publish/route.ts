import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { AlreadyPublishingError, publishPostToTargets } from "@/lib/posts/publish-post";
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
      include: { targets: true, mediaAssets: true },
    });

    if (!post) {
      return apiError("Gönderi bulunamadı.", 404);
    }

    if (post.targets.length === 0) {
      return apiError("Yayınlanacak platform hedefi bulunamadı.", 400);
    }

    if (post.mediaAssets.length === 0) {
      return apiError("Yayınlamak için en az bir medya yükleyin.", 400);
    }

    // The double-publish guard now lives inside publishPostToTargets as an
    // atomic claim; a concurrent/duplicate call throws AlreadyPublishingError.
    let result;
    try {
      result = await publishPostToTargets(postId);
    } catch (error) {
      if (error instanceof AlreadyPublishingError) {
        return apiError(error.message, 409);
      }
      throw error;
    }

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
