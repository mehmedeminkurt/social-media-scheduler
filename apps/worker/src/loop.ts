import { claimDuePostIds } from "@/lib/posts/queue";
import {
  AlreadyPublishingError,
  publishPostToTargets,
} from "@/lib/posts/publish-post";
import { serverEnv } from "@/lib/env";

const POLL_INTERVAL_MS = serverEnv.WORKER_POLL_INTERVAL_MS;
const BATCH_SIZE = serverEnv.WORKER_BATCH_SIZE;

export async function runWorkerLoop(): Promise<void> {
  console.log(
    `[worker] Started — poll every ${POLL_INTERVAL_MS}ms, batch size ${BATCH_SIZE}`,
  );

  while (true) {
    try {
      const postIds = await claimDuePostIds(BATCH_SIZE);

      if (postIds.length > 0) {
        console.log(`[worker] Claimed ${postIds.length} due post(s)`);
      }

      for (const postId of postIds) {
        try {
          const result = await publishPostToTargets(postId);
          console.log(
            `[worker] Post ${postId} finished with status ${result.postStatus}`,
          );
        } catch (error) {
          if (error instanceof AlreadyPublishingError) {
            console.log(`[worker] Post ${postId} already claimed — skipping`);
            continue;
          }

          console.error(`[worker] Post ${postId} failed:`, error);
        }
      }
    } catch (error) {
      console.error("[worker] Poll cycle error:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
