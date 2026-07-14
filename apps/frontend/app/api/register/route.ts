import bcrypt from "bcrypt";
import { Prisma, MembershipRole } from "@prisma/client";
import { registerSchema } from "@/lib/auth-schemas";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/lib/validate-request";
import { slugify } from "@/lib/slug";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateBody(registerSchema, body);

    if (!validation.ok) {
      return validation.response;
    }

    const { email, password, companyName } = validation.data;
    const hashedPassword = await bcrypt.hash(password, 10);

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
    console.error("!!! KAYIT HATASI !!!", error);

    // E-posta benzersizlik çakışması (slug zaten transaction içinde çözülüyor).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("Bu e-posta zaten kayıtlı.", 409);
    }

    return apiError("Kayıt sırasında bir hata oluştu.", 500);
  }
}
