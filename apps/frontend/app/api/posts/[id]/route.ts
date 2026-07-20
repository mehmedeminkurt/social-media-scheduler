import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { prisma } from "@/lib/prisma";
import { TenantAccessError } from "@/lib/tenant";

export async function GET(
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

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        targets: {
          orderBy: { createdAt: "asc" },
        },
        mediaAssets: {
          orderBy: { order: "asc" },
        },
        logs: {
          orderBy: { ts: "desc" },
          take: 50,
        },
      },
    });

    return apiSuccess(post);
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof PostNotFoundError) {
      return apiError(error.message, 404);
    }
    console.error("GET /api/posts/[id] error:", error);
    return apiError("Gönderi yüklenirken bir hata oluştu.", 500);
  }
}
