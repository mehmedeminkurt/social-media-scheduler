import bcrypt from "bcrypt";
import { Prisma, MembershipRole } from "@prisma/client";
import { registerSchema } from "@/lib/auth-schemas";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/lib/validate-request";
import { slugify } from "@/lib/slug";

// Slug çakışması GEÇİCİdir: eşzamanlı iki kayıt aynı boş slug'ı okuduğunda biri
// kaybeder. Yeniden denendiğinde döngü bir sonraki boş suffix'i bulur ve kayıt
// başarılı olur. E-posta çakışması ise KALICIdır — yeniden denemek işe yaramaz.
const MAX_SLUG_RETRIES = 3;

function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target as string[] | undefined;
  return target?.includes(field) ?? false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateBody(registerSchema, body);

    if (!validation.ok) {
      return validation.response;
    }

    const { email, password, companyName } = validation.data;
    const hashedPassword = await bcrypt.hash(password, 10);

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
      try {
        // Tek işlem (transaction): User + Company + Membership(OWNER) birlikte oluşur.
        // Herhangi biri başarısız olursa tamamı geri alınır — yarım kayıt kalmaz.
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { email, password: hashedPassword },
            select: { id: true, email: true },
          });

          // Slug'ı transaction içinde benzersizleştir (base, base-1, base-2, ...).
          const base = slugify(companyName);
          let slug = base;
          let suffix = 1;
          while (await tx.company.findUnique({ where: { slug } })) {
            slug = `${base}-${suffix}`;
            suffix += 1;
          }

          const company = await tx.company.create({
            data: { name: companyName, slug },
            select: { id: true, name: true, slug: true },
          });

          await tx.membership.create({
            data: {
              userId: user.id,
              companyId: company.id,
              role: MembershipRole.OWNER,
            },
          });

          return { user, company };
        });

        return apiSuccess({ message: "Kayıt başarılı", ...result }, 201);
      } catch (error: unknown) {
        // Kalıcı çakışma: bu e-posta gerçekten alınmış.
        if (isUniqueViolationOn(error, "email")) {
          return apiError("Bu e-posta zaten kayıtlı.", 409);
        }

        if (isUniqueViolationOn(error, "slug")) {
          // Geçici yarış: bir sonraki denemede boş suffix bulunur.
          if (attempt < MAX_SLUG_RETRIES) {
            continue;
          }

          console.error(
            "!!! KAYIT HATASI !!! slug yarışı çözülemedi, deneme:",
            attempt + 1,
          );
          return apiError(
            "Kayıt şu anda tamamlanamadı, lütfen tekrar deneyin.",
            503,
          );
        }

        throw error;
      }
    }

    // Döngü buraya düşmez (son deneme ya döner ya fırlatır); tip güvenliği için.
    return apiError("Kayıt şu anda tamamlanamadı, lütfen tekrar deneyin.", 503);
  } catch (error: unknown) {
    console.error("!!! BEKLENMEYEN HATA !!!", error);
    return apiError("Kayıt sırasında bir hata oluştu.", 500);
  }
}
