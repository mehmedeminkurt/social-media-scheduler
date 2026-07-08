import bcrypt from "bcrypt";
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
        password: hashedPassword 
      },
    });

    return NextResponse.json({ message: "Kayıt başarılı", user });
    
  } catch (error: unknown) {
    console.error("!!! KAYIT HATASI !!!", error); 
    
    const message = error instanceof Error ? error.message : "Bilinmeyen bir veritabanı hatası oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}