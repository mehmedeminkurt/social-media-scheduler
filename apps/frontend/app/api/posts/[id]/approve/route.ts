import { PostStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { approvePostSchema } from "@/lib/posts/schemas";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { PostNotFoundError, requirePostForCompany } from "@/lib/posts/access";
import { enqueuePostForPublish } from "@/lib/posts/queue";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdminAccess, RoleAccessError } from "@/lib/roles";
import { TenantAccessError } from "@/lib/tenant";
import { validateBody } from "@/lib/validate-request";

export async function POST(
  req: Request,
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

    await requireCompanyAdminAccess(userId, companyId);
    await requirePostForCompany(userId, companyId, postId);

    const body = await req.json();
    const validation = validateBody(approvePostSchema, body);
    if (!validation.ok) {
      return validation.response;
    }

    const { action, scheduledAt } = validation.data;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { targets: true, mediaAssets: true },
    });

    if (!post) {
      return apiError("Gönderi bulunamadı.", 404);
    }

    if (post.status !== PostStatus.PENDING_APPROVAL) {
      return apiError("Yalnızca onay bekleyen gönderiler onaylanabilir.", 409);
    }

    if (post.mediaAssets.length === 0) {
      return apiError("Yayınlamak için en az bir medya gereklidir.", 400);
    }

    const now = new Date();
    const approvedAt = now;

    if (action === "schedule") {
      const parsedScheduledAt = scheduledAt
        ? new Date(scheduledAt)
        : post.scheduledAt;

      if (!parsedScheduledAt) {
        return apiError("Planlama tarihi gereklidir.", 400);
      }

      if (parsedScheduledAt.getTime() <= now.getTime()) {
        return apiError("Planlanan tarih ve saat gelecekte olmalı.", 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.post.update({
          where: { id: postId },
          data: {
            status: PostStatus.SCHEDULED,
            scheduledAt: parsedScheduledAt,
            approvedById: userId,
            approvedAt,
          },
          include: {
            targets: true,
            mediaAssets: true,
            logs: { orderBy: { ts: "desc" }, take: 10 },
          },
        });

        await tx.postTarget.updateMany({
          where: { postId },
          data: { status: PostStatus.SCHEDULED },
        });

        await tx.postLog.create({
          data: {
            postId,
            level: "info",
            message: `Gönderi onaylandı ve ${parsedScheduledAt.toLocaleString("tr-TR")} için zamanlandı.`,
          },
        });

        return next;
      });

      return apiSuccess({ post: updated, queued: false });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.post.update({
        where: { id: postId },
        data: {
          approvedById: userId,
          approvedAt,
          scheduledAt: now,
        },
        include: {
          targets: true,
          mediaAssets: true,
          logs: { orderBy: { ts: "desc" }, take: 10 },
        },
      });

      await tx.postLog.create({
        data: {
          postId,
          level: "info",
          message: "Gönderi onaylandı; yayın kuyruğa alınıyor.",
        },
      });

      return next;
    });

    const queued = await enqueuePostForPublish(postId);
    if (!queued) {
      return apiError("Gönderi kuyruğa alınamadı.", 409);
    }

    const finalPost = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        targets: true,
        mediaAssets: true,
        logs: { orderBy: { ts: "desc" }, take: 10 },
      },
    });

    return apiSuccess({ post: finalPost, queued: true, previous: updated });
  } catch (error: unknown) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof RoleAccessError) {
      return apiError(error.message, 403);
    }
    if (error instanceof PostNotFoundError) {
      return apiError(error.message, 404);
    }
    console.error("POST /api/posts/[id]/approve error:", error);
    return apiError("Gönderi onaylanırken bir hata oluştu.", 500);
  }
}
