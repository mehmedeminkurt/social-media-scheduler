import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { credentialsSchema } from "@/lib/auth-schemas";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/lib/validate-request";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateBody(credentialsSchema, body);

    if (!validation.ok) {
      return validation.response;
    }

    const { email, password } = validation.data;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
      select: { id: true, email: true }
}   );

    return apiSuccess({ message: "Kayıt başarılı", user });
  } catch (error: unknown) {
    console.error("!!! KAYIT HATASI !!!", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("Bu e-posta zaten kayıtlı.", 409);
    }

    return apiError("Kayıt sırasında bir hata oluştu.", 500);
  }
}