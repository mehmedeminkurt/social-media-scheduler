import { NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
const resend = new Resend(process.env.RESEND_API_KEY); 

export async function POST(req: Request) {
  const { email } = await req.json();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ message: "Eğer mail kayıtlıysa, sıfırlama linki gönderildi." });
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
      from: 'onboarding@resend.dev', 
      to: email,
      subject: 'Şifre Sıfırlama Talebiniz',
      html: `<p>Şifrenizi sıfırlamak için tıklayın: <a href="${resetLink}">${resetLink}</a></p>`
    });
  } catch (error) {
    return NextResponse.json({ error: "Mail gönderilemedi" }, { status: 500 });
  }

  return NextResponse.json({ message: "Sıfırlama linki mail adresinize gönderildi." });
}