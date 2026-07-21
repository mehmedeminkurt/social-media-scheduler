import type { MediaAsset, Post, PostTarget, SocialAccount } from "@prisma/client";

export const SUPPORTED_PUBLISH_PLATFORMS = ["instagram", "linkedin"] as const;

export type PublishPlatform = (typeof SUPPORTED_PUBLISH_PLATFORMS)[number];

export type PublishOutcome = "published" | "pending" | "failed";

export type PostWithMedia = Post & { mediaAssets: MediaAsset[] };

export interface PublishResult {
  outcome: PublishOutcome;
  externalPostId?: string;
  /** Async flows (e.g. Reels) — poll until ready before media_publish */
  containerId?: string;
  error?: string;
}

export interface Publisher {
  readonly platform: PublishPlatform;
  publish(
    post: PostWithMedia,
    target: PostTarget,
    account: SocialAccount,
  ): Promise<PublishResult>;
  pollPublishStatus?(
    containerId: string,
    account: SocialAccount,
  ): Promise<PublishResult>;
}
