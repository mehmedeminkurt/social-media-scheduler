import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { uploadMedia } from "@/lib/storage/media";
import { requireCompanyAccess, TenantAccessError } from "@/lib/tenant";

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError("Yetkisiz erişim. Lütfen giriş yapın.", 401);
    }

    const companyId = session.user.activeCompanyId;
    if (!companyId) {
      return apiError("Aktif şirket bulunamadı.", 400);
    }

    await requireCompanyAccess(session.user.id, companyId);

    const formData = await req.formData();
    const file = formData.get("logo");

    if (!(file instanceof File)) {
      return apiError("Logo dosyası (logo) gereklidir.", 400);
    }

    if (file.size === 0) {
      return apiError("Boş dosya yüklenemez.", 400);
    }

    if (file.size > MAX_LOGO_SIZE) {
      return apiError("Logo boyutu 5 MB sınırını aşıyor.", 400);
    }

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      return apiError("Desteklenmeyen format. JPEG, PNG, WebP veya SVG yükleyin.", 400);
    }

    // Determine extension from mime type
    const extensionMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    const extension = extensionMap[file.type] || "png";
    const buffer = Buffer.from(await file.arrayBuffer());

    const url = await uploadMedia(buffer, `${companyId}/logos`, extension, file.type);

    return apiSuccess({ url }, 201);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return apiError(error.message, 403);
    }
    console.error("POST /api/brand-kits/upload-logo error:", error);
    return apiError("Logo yüklenirken bir hata oluştu.", 500);
  }
}
