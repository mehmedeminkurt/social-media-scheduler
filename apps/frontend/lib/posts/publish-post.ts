import type { PostTarget, SocialAccount } from "@prisma/client";
import { PostStatus } from "@prisma/client";

import { getPublisher } from "@/lib/publishers";
import { PublisherError } from "@/lib/publishers/errors";
import type { PostWithMedia, PublishResult, Publisher } from "@/lib/publishers/publisher";
import { prisma } from "@/lib/prisma";

const REELS_POLL_INTERVAL_MS = 3000;
const REELS_MAX_POLL_ATTEMPTS = 40;

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

async function publishToTarget(
  post: PostWithMedia,
  target: PostTarget,
  account: SocialAccount,
): Promise<TargetPublishOutcome> {
  const publisher = getPublisher(target.platform);

  let result: PublishResult;

  try {
    result = await publisher.publish(post, target, account);
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
}

function aggregatePostStatus(targets: TargetPublishOutcome[]): PostStatus {
  if (targets.length === 0) {
    return PostStatus.FAILED;
  }

  const allPublished = targets.every((target) => target.status === PostStatus.PUBLISHED);
  if (allPublished) {
    return PostStatus.PUBLISHED;
  }

  return PostStatus.FAILED;
}

export async function publishPostToTargets(postId: string): Promise<PostPublishResult> {
  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: {
      targets: true,
      mediaAssets: true,
    },
  });

  await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.PUBLISHING },
  });

  await prisma.postLog.create({
    data: {
      postId,
      level: "info",
      message: "Yayın işlemi başlatıldı.",
    },
  });

  const targetOutcomes: TargetPublishOutcome[] = [];

  for (const target of post.targets) {
    const account = await prisma.socialAccount.findFirst({
      where: {
        companyId: post.companyId,
        platform: target.platform,
      },
    });

    if (!account) {
      const error = `${target.platform} için bağlı hesap bulunamadı.`;
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: PostStatus.FAILED,
          error,
          attempts: { increment: 1 },
        },
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
        externalPostId: outcome.externalPostId ?? null,
        error: outcome.error ?? null,
        attempts: { increment: 1 },
      },
    });

    await prisma.postLog.create({
      data: {
        postId,
        level: outcome.status === PostStatus.PUBLISHED ? "info" : "error",
        message:
          outcome.status === PostStatus.PUBLISHED
            ? `${target.platform} yayını başarılı.${
                outcome.externalPostId ? ` ID: ${outcome.externalPostId}` : ""
              }`
            : `${target.platform} yayını başarısız: ${outcome.error}`,
      },
    });

    targetOutcomes.push(outcome);
  }

  const postStatus = aggregatePostStatus(targetOutcomes);

  await prisma.post.update({
    where: { id: postId },
    data: { status: postStatus },
  });

  return { postStatus, targets: targetOutcomes };
}
