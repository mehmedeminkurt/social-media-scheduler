import "@/lib/env";
import { PrismaClient } from "@prisma/client";

const globalP = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalP.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalP.prisma = prisma;
}
