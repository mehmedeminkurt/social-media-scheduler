import { PostStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_BATCH_SIZE = 10;

/**
 * Claims due scheduled posts using Postgres FOR UPDATE SKIP LOCKED so multiple
 * worker instances can run without picking the same rows.
 *
 * Locks are held only for the duration of the transaction; publishPostToTargets
 * performs the atomic SCHEDULED/DRAFT → PUBLISHING claim before publishing.
 */
export async function claimDuePostIds(
  limit = DEFAULT_BATCH_SIZE,
): Promise<string[]> {
  const rows = await prisma.$transaction(async (tx) => {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Post"
      WHERE "scheduledAt" <= NOW() AND status = ${PostStatus.SCHEDULED}::"PostStatus"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;
  });

  return rows.map((row) => row.id);
}

/**
 * Marks a post for immediate background publishing by the worker.
 */
export async function enqueuePostForPublish(postId: string): Promise<boolean> {
  const result = await prisma.post.updateMany({
    where: {
      id: postId,
      status: { notIn: [PostStatus.PUBLISHING, PostStatus.PUBLISHED] },
    },
    data: {
      status: PostStatus.SCHEDULED,
      scheduledAt: new Date(),
    },
  });

  if (result.count === 0) {
    return false;
  }

  await prisma.postLog.create({
    data: { postId, level: "info", message: "Yayın kuyruğa alındı." },
  });

  return true;
}
