export const SUPPORTED_PUBLISH_PLATFORMS = ["instagram"] as const;

export type PublishPlatform = (typeof SUPPORTED_PUBLISH_PLATFORMS)[number];

export type PublishOutcome = "published" | "pending" | "failed";

export type MediaType = "image" | "video";

export interface PublishMediaItem {
  url: string;
  type: MediaType;
  order: number;
}

export interface PublishContext {
  companyId: string;
  caption: string;
  media: PublishMediaItem[];
  accessToken: string;
  externalAccountId: string;
}

export interface PublishResult {
  outcome: PublishOutcome;
  externalPostId?: string;
  /** Async flows (e.g. Reels) — poll until ready before media_publish */
  containerId?: string;
  error?: string;
}

export interface Publisher {
  readonly platform: PublishPlatform;
  publish(context: PublishContext): Promise<PublishResult>;
  pollPublishStatus?(
    containerId: string,
    accessToken: string,
    externalAccountId: string,
  ): Promise<PublishResult>;
}
