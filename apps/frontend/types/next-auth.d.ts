import type { DefaultSession } from "next-auth";
import type { MembershipRole } from "@prisma/client";

// NextAuth'un varsayılan tiplerini multi-tenant alanlarla genişletiyoruz:
// session.user / authorize() dönüşü / JWT hepsi activeCompanyId + role taşır.
declare module "next-auth" {
  interface User {
    id: string;
    activeCompanyId: string | null;
    role: MembershipRole | null;
  }

  interface Session {
    user: {
      id: string;
      activeCompanyId: string | null;
      role: MembershipRole | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    activeCompanyId: string | null;
    role: MembershipRole | null;
  }
}
