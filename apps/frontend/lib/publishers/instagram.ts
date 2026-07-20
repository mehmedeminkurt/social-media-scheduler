import {
  PublisherApiError,
  PublisherValidationError,
} from "@/lib/publishers/errors";
import type {
  PublishContext,
  Publisher,
  PublishResult,
} from "@/lib/publishers/publisher";

const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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

async function createImageContainer(
  externalAccountId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${externalAccountId}/media`);
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

async function createReelsContainer(
  externalAccountId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${externalAccountId}/media`);
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
  const url = new URL(`${GRAPH_API_BASE}/${externalAccountId}/media_publish`);
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
  const url = new URL(`${GRAPH_API_BASE}/${containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  return parseMetaResponse<ContainerStatusResponse>(
    response,
    "Instagram konteyner durumu alınamadı.",
  );
}

function sortedMedia(context: PublishContext) {
  return [...context.media].sort((a, b) => a.order - b.order);
}

async function publishSingleImage(context: PublishContext): Promise<PublishResult> {
  const [item] = sortedMedia(context);

  if (!item || item.type !== "image") {
    throw new PublisherValidationError("Instagram için tek bir görsel gereklidir.");
  }

  const containerId = await createImageContainer(
    context.externalAccountId,
    context.accessToken,
    item.url,
    context.caption,
  );

  const externalPostId = await publishContainer(
    context.externalAccountId,
    context.accessToken,
    containerId,
  );

  return {
    outcome: "published",
    externalPostId,
    containerId,
  };
}

async function startReelsPublish(context: PublishContext): Promise<PublishResult> {
  const [item] = sortedMedia(context);

  if (!item || item.type !== "video") {
    throw new PublisherValidationError("Instagram Reels için tek bir video gereklidir.");
  }

  const containerId = await createReelsContainer(
    context.externalAccountId,
    context.accessToken,
    item.url,
    context.caption,
  );

  return {
    outcome: "pending",
    containerId,
  };
}

export const instagramPublisher: Publisher = {
  platform: "instagram",

  async publish(context) {
    const media = sortedMedia(context);

    if (media.length === 0) {
      throw new PublisherValidationError("Yayınlamak için en az bir medya gereklidir.");
    }

    if (media.length > 1) {
      throw new PublisherValidationError(
        "Instagram adaptörü şu an yalnızca tekli görsel veya Reels destekliyor.",
      );
    }

    const [item] = media;

    if (item.type === "image") {
      return publishSingleImage(context);
    }

    if (item.type === "video") {
      return startReelsPublish(context);
    }

    throw new PublisherValidationError(`Desteklenmeyen medya türü: ${item.type}`);
  },

  async pollPublishStatus(containerId, accessToken, externalAccountId) {
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
