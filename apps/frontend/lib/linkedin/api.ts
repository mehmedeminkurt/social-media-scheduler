import {
  PublisherApiError,
  PublisherAuthError,
} from "@/lib/publishers/errors";

export const LINKEDIN_API_VERSION = "202501";

export const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";

export const LINKEDIN_ORG_URN_PREFIX = "urn:li:organization:";

interface LinkedInErrorBody {
  message?: string;
  status?: number;
  serviceErrorCode?: number;
}

export function toOrganizationUrn(externalId: string): string {
  if (externalId.startsWith(LINKEDIN_ORG_URN_PREFIX)) {
    return externalId;
  }

  return `${LINKEDIN_ORG_URN_PREFIX}${externalId}`;
}

export function isOrganizationExternalId(externalId: string): boolean {
  if (externalId.startsWith(LINKEDIN_ORG_URN_PREFIX)) {
    return true;
  }

  return /^\d+$/.test(externalId);
}

export function linkedInHeaders(
  accessToken: string,
  contentType = "application/json",
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": contentType,
  };
}

function mapLinkedInError(response: Response, body: LinkedInErrorBody): never {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const retryHint = retryAfter ? ` (${retryAfter}s sonra tekrar denenebilir)` : "";
    throw new PublisherApiError(
      `LinkedIn günlük paylaşım limitine ulaşıldı (~100 çağrı/gün). Tekrar deneme yapılmadı${retryHint}.`,
      body,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new PublisherAuthError(
      body.message ?? "LinkedIn erişim anahtarı geçersiz veya süresi dolmuş.",
    );
  }

  throw new PublisherApiError(
    body.message ?? `LinkedIn API hatası (${response.status}).`,
    body,
  );
}

export async function linkedInFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<{ response: Response; data: T }> {
  const url = path.startsWith("http") ? path : `${LINKEDIN_REST_BASE}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...linkedInHeaders(accessToken),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    const body = isJson
      ? ((await response.json()) as LinkedInErrorBody)
      : { message: await response.text() };
    mapLinkedInError(response, body);
  }

  if (response.status === 204 || !isJson) {
    return { response, data: {} as T };
  }

  const data = (await response.json()) as T;
  return { response, data };
}

export function extractRestliId(response: Response, data: Record<string, unknown>): string {
  const headerId = response.headers.get("x-restli-id");
  if (headerId) {
    return headerId;
  }

  const id = data.id;
  if (typeof id === "string") {
    return id;
  }

  throw new PublisherApiError("LinkedIn yanıtından gönderi kimliği alınamadı.", data);
}
