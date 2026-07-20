import type { MediaAsset, SocialAccount } from "@prisma/client";

import { decrypt } from "@/lib/crypto";
import { META_GRAPH_API_BASE } from "@/lib/meta/graph-api";
import {
  PublisherApiError,
  PublisherValidationError,
} from "@/lib/publishers/errors";
import type {
  PostWithMedia,
  Publisher,
  PublishResult,
} from "@/lib/publishers/publisher";

interface MetaGraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

interface MediaContainerResponse extends MetaGraphErrorBody {
  id?: string;
}

interface ContainerStatusResponse extends MetaGraphErrorBody {
  status_code?: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
}

interface MediaPublishResponse extends MetaGraphErrorBody {
  id?: string;
}

type SortedMediaItem = {
  url: string;
  type: string;
  order: number;
};

function getMetaErrorMessage(body: MetaGraphErrorBody, fallback: string): string {
  return body.error?.message ?? fallback;
}

async function parseMetaResponse<T extends MetaGraphErrorBody>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const body = (await response.json()) as T;

  if (!response.ok || body.error) {
    throw new PublisherApiError(getMetaErrorMessage(body, fallbackMessage), body);
  }

  return body;
}

function sortedMedia(post: PostWithMedia): SortedMediaItem[] {
  return [...post.mediaAssets]
    .sort((a, b) => a.order - b.order)
    .map((asset: MediaAsset) => ({
      url: asset.renderedUrl ?? asset.originalUrl,
      type: asset.type,
      order: asset.order,
    }));
}

function resolveAccessToken(account: SocialAccount): string {
  return decrypt(account.accessTokenEncrypted);
}

function assertMediaCombination(media: SortedMediaItem[]): void {
  if (media.length === 0) {
    throw new PublisherValidationError("Yayınlamak için en az bir medya gereklidir.");
  }

  const hasVideo = media.some((item) => item.type === "video");
  const hasImage = media.some((item) => item.type === "image");

  if (hasVideo && hasImage) {
    throw new PublisherValidationError(
      "Görsel ve video aynı gönderide birlikte yayınlanamaz.",
    );
  }

  if (hasVideo && media.length > 1) {
    throw new PublisherValidationError("Instagram Reels yalnızca tek bir video destekler.");
  }

  if (hasImage && media.length > 10) {
    throw new PublisherValidationError("Instagram carousel en fazla 10 görsel destekler.");
  }
}

async function createImageContainer(
  externalAccountId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const url = new URL(`${META_GRAPH_API_BASE}/${externalAccountId}/media`);
  url.searchParams.set("image_url", imageUrl);
  url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const body = await parseMetaResponse<MediaContainerResponse>(
    response,
    "Instagram görsel konteyneri oluşturulamadı.",
  );

  if (!body.id) {
    throw new PublisherApiError("Instagram konteyner kimliği alınamadı.", body);
  }

  return body.id;
}

async function createCarouselChildContainer(
  externalAccountId: string,
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  const url = new URL(`${META_GRAPH_API_BASE}/${externalAccountId}/media`);
  url.searchParams.set("image_url", imageUrl);
  url.searchParams.set("is_carousel_item", "true");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const body = await parseMetaResponse<MediaContainerResponse>(
    response,
    "Instagram carousel öğe konteyneri oluşturulamadı.",
  );

  if (!body.id) {
    throw new PublisherApiError("Instagram carousel öğe kimliği alınamadı.", body);
  }

  return body.id;
}

async function createCarouselContainer(
  externalAccountId: string,
  accessToken: string,
  childContainerIds: string[],
  caption: string,
): Promise<string> {
  const url = new URL(`${META_GRAPH_API_BASE}/${externalAccountId}/media`);
  url.searchParams.set("media_type", "CAROUSEL");
  url.searchParams.set("children", childContainerIds.join(","));
  url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const body = await parseMetaResponse<MediaContainerResponse>(
    response,
    "Instagram carousel konteyneri oluşturulamadı.",
  );

  if (!body.id) {
    throw new PublisherApiError("Instagram carousel konteyner kimliği alınamadı.", body);
  }

  return body.id;
}

async function createReelsContainer(
  externalAccountId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const url = new URL(`${META_GRAPH_API_BASE}/${externalAccountId}/media`);
  url.searchParams.set("media_type", "REELS");
  url.searchParams.set("video_url", videoUrl);
  url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const body = await parseMetaResponse<MediaContainerResponse>(
    response,
    "Instagram Reels konteyneri oluşturulamadı.",
  );

  if (!body.id) {
    throw new PublisherApiError("Instagram Reels konteyner kimliği alınamadı.", body);
  }

  return body.id;
}

async function publishContainer(
  externalAccountId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const url = new URL(`${META_GRAPH_API_BASE}/${externalAccountId}/media_publish`);
  url.searchParams.set("creation_id", containerId);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "POST" });
  const body = await parseMetaResponse<MediaPublishResponse>(
    response,
    "Instagram gönderisi yayınlanamadı.",
  );

  if (!body.id) {
    throw new PublisherApiError("Instagram yayın kimliği alınamadı.", body);
  }

  return body.id;
}

async function getContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<ContainerStatusResponse> {
  const url = new URL(`${META_GRAPH_API_BASE}/${containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  return parseMetaResponse<ContainerStatusResponse>(
    response,
    "Instagram konteyner durumu alınamadı.",
  );
}

async function publishSingleImage(
  externalAccountId: string,
  accessToken: string,
  caption: string,
  item: SortedMediaItem,
): Promise<PublishResult> {
  if (item.type !== "image") {
    throw new PublisherValidationError("Instagram için tek bir görsel gereklidir.");
  }

  const containerId = await createImageContainer(
    externalAccountId,
    accessToken,
    item.url,
    caption,
  );

  const externalPostId = await publishContainer(
    externalAccountId,
    accessToken,
    containerId,
  );

  return {
    outcome: "published",
    externalPostId,
    containerId,
  };
}

async function publishCarousel(
  externalAccountId: string,
  accessToken: string,
  caption: string,
  items: SortedMediaItem[],
): Promise<PublishResult> {
  if (items.some((item) => item.type !== "image")) {
    throw new PublisherValidationError("Carousel yalnızca görsellerden oluşabilir.");
  }

  const childContainerIds: string[] = [];

  for (const item of items) {
    const childId = await createCarouselChildContainer(
      externalAccountId,
      accessToken,
      item.url,
    );
    childContainerIds.push(childId);
  }

  const containerId = await createCarouselContainer(
    externalAccountId,
    accessToken,
    childContainerIds,
    caption,
  );

  const externalPostId = await publishContainer(
    externalAccountId,
    accessToken,
    containerId,
  );

  return {
    outcome: "published",
    externalPostId,
    containerId,
  };
}

async function startReelsPublish(
  externalAccountId: string,
  accessToken: string,
  caption: string,
  item: SortedMediaItem,
): Promise<PublishResult> {
  if (item.type !== "video") {
    throw new PublisherValidationError("Instagram Reels için tek bir video gereklidir.");
  }

  const containerId = await createReelsContainer(
    externalAccountId,
    accessToken,
    item.url,
    caption,
  );

  return {
    outcome: "pending",
    containerId,
  };
}

export const instagramPublisher: Publisher = {
  platform: "instagram",

  async publish(post, _target, account) {
    const media = sortedMedia(post);
    assertMediaCombination(media);

    const accessToken = resolveAccessToken(account);
    const externalAccountId = account.externalId;

    if (media.length === 1) {
      const [item] = media;
      if (!item) {
        throw new PublisherValidationError("Yayınlamak için en az bir medya gereklidir.");
      }

      if (item.type === "image") {
        return publishSingleImage(externalAccountId, accessToken, post.caption, item);
      }

      if (item.type === "video") {
        return startReelsPublish(externalAccountId, accessToken, post.caption, item);
      }

      throw new PublisherValidationError(`Desteklenmeyen medya türü: ${item.type}`);
    }

    return publishCarousel(externalAccountId, accessToken, post.caption, media);
  },

  async pollPublishStatus(containerId, account) {
    const accessToken = resolveAccessToken(account);
    const externalAccountId = account.externalId;
    const status = await getContainerStatus(containerId, accessToken);

    switch (status.status_code) {
      case "IN_PROGRESS":
        return { outcome: "pending", containerId };

      case "FINISHED": {
        const externalPostId = await publishContainer(
          externalAccountId,
          accessToken,
          containerId,
        );

        return {
          outcome: "published",
          externalPostId,
          containerId,
        };
      }

      case "PUBLISHED":
        return {
          outcome: "published",
          containerId,
        };

      case "EXPIRED":
        return {
          outcome: "failed",
          containerId,
          error: "Instagram konteyneri süresi doldu.",
        };

      case "ERROR":
      default:
        return {
          outcome: "failed",
          containerId,
          error: "Instagram medya işleme hatası.",
        };
    }
  },
};
