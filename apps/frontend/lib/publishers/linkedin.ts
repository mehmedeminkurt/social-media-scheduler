import type { MediaAsset, SocialAccount } from "@prisma/client";

import { decrypt } from "@/lib/crypto";
import {
  extractRestliId,
  isOrganizationExternalId,
  linkedInFetch,
  linkedInHeaders,
  toOrganizationUrn,
} from "@/lib/linkedin/api";
import {
  PublisherApiError,
  PublisherAuthError,
  PublisherConfigError,
  PublisherValidationError,
} from "@/lib/publishers/errors";
import type {
  PostWithMedia,
  Publisher,
  PublishResult,
} from "@/lib/publishers/publisher";

interface InitializeUploadResponse {
  value?: {
    uploadUrl?: string;
    image?: string;
  };
}

type SortedMediaItem = {
  url: string;
  type: string;
};

function sortedMedia(post: PostWithMedia): SortedMediaItem[] {
  return [...post.mediaAssets]
    .sort((a, b) => a.order - b.order)
    .map((asset: MediaAsset) => ({
      url: asset.renderedUrl ?? asset.originalUrl,
      type: asset.type,
    }));
}

function assertLinkedInMedia(media: SortedMediaItem[]): void {
  if (media.length > 1) {
    throw new PublisherValidationError(
      "LinkedIn şu an yalnızca tek görsel veya metin-only gönderi destekler.",
    );
  }

  if (media.length === 1 && media[0]?.type !== "image") {
    throw new PublisherValidationError("LinkedIn yalnızca görsel paylaşımını destekler.");
  }
}

function resolveAccessContext(account: SocialAccount): {
  accessToken: string;
  organizationUrn: string;
} {
  if (!account.accessTokenEncrypted) {
    throw new PublisherConfigError(
      "LinkedIn yapılandırılmamış. Ayarlar'dan uygulama bilgilerini girin ve hesabı bağlayın.",
    );
  }

  if (!isOrganizationExternalId(account.externalId)) {
    throw new PublisherConfigError(
      "LinkedIn organizasyon kimliği bulunamadı. Hesabı w_organization_social kapsamıyla yeniden bağlayın.",
    );
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now()) {
    throw new PublisherAuthError("LinkedIn erişim anahtarının süresi dolmuş. Hesabı yeniden bağlayın.");
  }

  let accessToken: string;
  try {
    accessToken = decrypt(account.accessTokenEncrypted);
  } catch {
    throw new PublisherConfigError(
      "LinkedIn yapılandırılmamış. Ayarlar'dan uygulama bilgilerini girin ve hesabı bağlayın.",
    );
  }

  if (!accessToken) {
    throw new PublisherConfigError(
      "LinkedIn yapılandırılmamış. Ayarlar'dan uygulama bilgilerini girin ve hesabı bağlayın.",
    );
  }

  return {
    accessToken,
    organizationUrn: toOrganizationUrn(account.externalId),
  };
}

async function uploadImage(
  accessToken: string,
  organizationUrn: string,
  imageUrl: string,
): Promise<string> {
  const { data: initData } = await linkedInFetch<InitializeUploadResponse>(
    "/images?action=initializeUpload",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: organizationUrn,
        },
      }),
    },
  );

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new PublisherApiError(
      "LinkedIn görsel yükleme başlatılamadı.",
      initData,
    );
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new PublisherApiError("Görsel dosyası indirilemedi.", {
      status: imageRes.status,
      url: imageUrl,
    });
  }

  const imageBuffer = await imageRes.arrayBuffer();
  const contentType = imageRes.headers.get("content-type") ?? "application/octet-stream";

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: linkedInHeaders(accessToken, contentType),
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const uploadBody = await uploadRes.text();
    throw new PublisherApiError("LinkedIn görsel yüklemesi başarısız oldu.", {
      status: uploadRes.status,
      body: uploadBody,
    });
  }

  return imageUrn;
}

async function createPost(
  accessToken: string,
  organizationUrn: string,
  commentary: string,
  imageUrn?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    author: organizationUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
    },
    lifecycleState: "PUBLISHED",
  };

  if (imageUrn) {
    body.content = {
      media: {
        id: imageUrn,
      },
    };
  }

  const { response, data } = await linkedInFetch<Record<string, unknown>>(
    "/posts",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  return extractRestliId(response, data);
}

export const linkedinPublisher: Publisher = {
  platform: "linkedin",

  async publish(post, _target, account) {
    const media = sortedMedia(post);
    assertLinkedInMedia(media);

    const { accessToken, organizationUrn } = resolveAccessContext(account);

    let imageUrn: string | undefined;
    const firstMedia = media[0];

    if (firstMedia?.type === "image") {
      imageUrn = await uploadImage(accessToken, organizationUrn, firstMedia.url);
    }

    const externalPostId = await createPost(
      accessToken,
      organizationUrn,
      post.caption,
      imageUrn,
    );

    return {
      outcome: "published",
      externalPostId,
    };
  },
};
