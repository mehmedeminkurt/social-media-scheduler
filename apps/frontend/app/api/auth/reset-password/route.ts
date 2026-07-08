import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    const user = await prisma.user.findUnique({ 
      where: { resetToken: token } 
    });

    if (!user) {
      return NextResponse.json({ error: "Token geçersiz." }, { status: 400 });
    }

    if (user.resetTokenExp && new Date() > user.resetTokenExp) {
      return NextResponse.json({ error: "Token süresi dolmuş." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        password: hashedPassword, 
        resetToken: null, 
        resetTokenExp: null 
      },
    });

    return NextResponse.json({ message: "Şifre başarıyla güncellendi." });
  } catch (error) {
    console.error("Sıfırlama hatası:", error);
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}