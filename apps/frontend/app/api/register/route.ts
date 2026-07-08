import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email, password } = body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
      },
    });

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