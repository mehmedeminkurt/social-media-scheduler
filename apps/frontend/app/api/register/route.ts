import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Gelen veri:", body);

    const { email, password } = body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
      },
    });

    return NextResponse.json({ message: "Kayıt başarılı", user });
  } catch (error: unknown) {
    console.error("!!! KAYIT HATASI !!!", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Bu e-posta zaten kayıtlı." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Kayıt sırasında bir hata oluştu." },
      { status: 500 },
    );
  }
}