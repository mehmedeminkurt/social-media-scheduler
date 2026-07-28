import type { PostTarget, SocialAccount } from "@prisma/client";
import { PostStatus } from "@prisma/client";

import { getPublisher } from "@/lib/publishers";
import { PublisherError } from "@/lib/publishers/errors";
import type { PostWithMedia, PublishResult, Publisher } from "@/lib/publishers/publisher";
import { prisma } from "@/lib/prisma";

const REELS_POLL_INTERVAL_MS = 3000;
const REELS_MAX_POLL_ATTEMPTS = 40;

/** Thrown when the post is already being published or has been published. */
export class AlreadyPublishingError extends Error {
  constructor(message = "Gönderi zaten yayınlanıyor veya yayınlandı.") {
    super(message);
    this.name = "AlreadyPublishingError";
  }
}

export type TargetPublishOutcome = {
  platform: string;
  status: PostStatus;
  externalPostId?: string;
  error?: string;
};

export type PostPublishResult = {
  postStatus: PostStatus;
  targets: TargetPublishOutcome[];
};

async function pollUntilPublished(
  publisher: Publisher,
  containerId: string,
  account: SocialAccount,
): Promise<PublishResult> {
  if (!publisher.pollPublishStatus) {
    return {
      outcome: "failed",
      error: "Platform asenkron yayın durumunu desteklemiyor.",
    };
  }

  for (let attempt = 0; attempt < REELS_MAX_POLL_ATTEMPTS; attempt++) {
    const result = await publisher.pollPublishStatus(containerId, account);

    if (result.outcome !== "pending") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, REELS_POLL_INTERVAL_MS));
  }

  return {
    outcome: "failed",
    containerId,
    error: "Instagram medya işleme zaman aşımına uğradı.",
  };
}

// Fully guarded: any throw (including during the async poll step) becomes a
// FAILED outcome for THIS target — it never aborts the rest of the post.
async function publishToTarget(
  post: PostWithMedia,
  target: PostTarget,
  account: SocialAccount,
): Promise<TargetPublishOutcome> {
  const publisher = getPublisher(target.platform);

  try {
    let result = await publisher.publish(post, target, account);

    if (result.outcome === "pending" && result.containerId) {
      result = await pollUntilPublished(publisher, result.containerId, account);
    }

    if (result.outcome === "published") {
      return {
        platform: target.platform,
        status: PostStatus.PUBLISHED,
        externalPostId: result.externalPostId,
      };
    }

    return {
      platform: target.platform,
      status: PostStatus.FAILED,
      error: result.error ?? "Yayın başarısız oldu.",
    };
  } catch (error) {
    const message =
      error instanceof PublisherError
        ? error.message
        : "Yayın sırasında beklenmedik bir hata oluştu.";

    return {
      platform: target.platform,
      status: PostStatus.FAILED,
      error: message,
    };
  }
}

function buildTargetLogMessage(
  platform: string,
  outcome: TargetPublishOutcome,
): string {
  if (outcome.status !== PostStatus.PUBLISHED) {
    return `${platform} yayını başarısız: ${outcome.error}`;
  }

  const idSuffix = outcome.externalPostId ? ` ID: ${outcome.externalPostId}` : "";
  return `${platform} yayını başarılı.${idSuffix}`;
}

function aggregatePostStatus(statuses: PostStatus[]): PostStatus {
  if (statuses.length === 0) {
    return PostStatus.FAILED;
  }

  const publishedCount = statuses.filter(
    (status) => status === PostStatus.PUBLISHED,
  ).length;

  if (publishedCount === statuses.length) {
    return PostStatus.PUBLISHED;
  }

  if (publishedCount > 0) {
    return PostStatus.PARTIAL;
  }

  return PostStatus.FAILED;
}

async function finalizePostStatus(postId: string): Promise<PostStatus> {
  const targets = await prisma.postTarget.findMany({
    where: { postId },
    select: { status: true },
  });

  const status = aggregatePostStatus(targets.map((target) => target.status));

  await prisma.post.update({
    where: { id: postId },
    data: { status },
  });

  return status;
}

export async function publishPostToTargets(
  postId: string,
): Promise<PostPublishResult> {
  // Atomic claim: only one caller can move the post into PUBLISHING. A second
  // concurrent /publish (double-click, retry) matches 0 rows and is rejected,
  // so we never publish the same post twice.
  const claim = await prisma.post.updateMany({
    where: {
      id: postId,
      status: { notIn: [PostStatus.PUBLISHING, PostStatus.PUBLISHED] },
    },
    data: { status: PostStatus.PUBLISHING },
  });

  if (claim.count === 0) {
    throw new AlreadyPublishingError();
  }

  await prisma.postLog.create({
    data: { postId, level: "info", message: "Yayın işlemi başlatıldı." },
  });

  try {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { targets: true, mediaAssets: true },
    });

    const targetOutcomes: TargetPublishOutcome[] = [];

    for (const target of post.targets) {
      // Retry safety: never re-publish a target that already succeeded — that
      // would create a duplicate real post on the platform.
      if (target.status === PostStatus.PUBLISHED) {
        targetOutcomes.push({
          platform: target.platform,
          status: PostStatus.PUBLISHED,
          externalPostId: target.externalPostId ?? undefined,
        });
        continue;
      }

      const account = await prisma.socialAccount.findFirst({
        where: { companyId: post.companyId, platform: target.platform },
      });

      if (!account) {
        const error = `${target.platform} için bağlı hesap bulunamadı.`;
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.FAILED, error, attempts: { increment: 1 } },
        });
        await prisma.postLog.create({
          data: { postId, level: "error", message: error },
        });
        targetOutcomes.push({
          platform: target.platform,
          status: PostStatus.FAILED,
          error,
        });
        continue;
      }

      const outcome = await publishToTarget(post, target, account);

      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: outcome.status,
          externalPostId: outcome.externalPostId ?? target.externalPostId ?? null,
          error: outcome.error ?? null,
          attempts: { increment: 1 },
        },
      });

      await prisma.postLog.create({
        data: {
          postId,
          level: outcome.status === PostStatus.PUBLISHED ? "info" : "error",
          message: buildTargetLogMessage(target.platform, outcome),
        },
      });

      targetOutcomes.push(outcome);
    }

    const postStatus = await finalizePostStatus(postId);
    return { postStatus, targets: targetOutcomes };
  } catch (error) {
    // Never leave the post stuck in PUBLISHING on an unexpected failure —
    // recompute status from whatever the targets persisted so a retry is possible.
    try {
      const status = await finalizePostStatus(postId);
      if (status === PostStatus.PUBLISHING) {
        await prisma.post.update({
          where: { id: postId },
          data: { status: PostStatus.FAILED },
        });
      }
      await prisma.postLog.create({
        data: {
          postId,
          level: "error",
          message: "Yayın beklenmedik şekilde durdu.",
        },
      });
    } catch {
      // Best-effort recovery; surface the original error below.
    }

    throw error;
  }
}
