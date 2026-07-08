import bcrypt from "bcrypt";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    const user = await prisma.user.findUnique({
      where: { resetToken: token },
    });

    if (!user) {
      return apiError("Token geçersiz.", 400);
    }

    if (user.resetTokenExp && new Date() > user.resetTokenExp) {
      return apiError("Token süresi dolmuş.", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return apiSuccess({ message: "Şifre başarıyla güncellendi." });
  } catch (error) {
    console.error("Sıfırlama hatası:", error);
    return apiError("Bir hata oluştu.", 500);
  }
}