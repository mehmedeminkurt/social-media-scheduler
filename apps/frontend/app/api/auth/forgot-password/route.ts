import { Resend } from "resend";
import crypto from "crypto";
import { apiError, apiSuccess } from "@/lib/api-response-server";
import { prisma } from "@/lib/prisma";
const responseMessage = "Eğer bu e-posta adresiyle bir hesabınız varsa, şifre sıfırlama bağlantısını içeren bir e-posta gönderdik.";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const { email } = await req.json();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return apiSuccess({
      message: responseMessage,
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExp = new Date(Date.now() + 3600000);

  await prisma.user.update({
    where: { email },
    data: { resetToken, resetTokenExp },
  });

  const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Şifre Sıfırlama Talebiniz",
      html: `<p>Şifrenizi sıfırlamak için tıklayın: <a href="${resetLink}">${resetLink}</a></p>`,
    });
  } catch (error) {
    return apiError("Mail gönderilemedi", 500);
  }

  return apiSuccess({ message: responseMessage });
}