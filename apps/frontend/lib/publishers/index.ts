import { PublisherUnsupportedError } from "@/lib/publishers/errors";
import { instagramPublisher } from "@/lib/publishers/instagram";
import type { PublishPlatform, Publisher } from "@/lib/publishers/publisher";
import { SUPPORTED_PUBLISH_PLATFORMS } from "@/lib/publishers/publisher";

const publisherRegistry: Record<PublishPlatform, Publisher> = {
  instagram: instagramPublisher,
};

export function isSupportedPublishPlatform(
  platform: string,
): platform is PublishPlatform {
  return (SUPPORTED_PUBLISH_PLATFORMS as readonly string[]).includes(platform);
}

export function getPublisher(platform: string): Publisher {
  if (!isSupportedPublishPlatform(platform)) {
    throw new PublisherUnsupportedError(platform);
  }

  return publisherRegistry[platform];
}

export * from "@/lib/publishers/errors";
export * from "@/lib/publishers/publisher";
