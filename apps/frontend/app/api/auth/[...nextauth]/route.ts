import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { credentialsSchema, invalidInputMessage } from "@/lib/auth-schemas";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });

        if (!parsed.success) {
          throw new Error(invalidInputMessage);
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) return null;

        // Aktif şirket = kullanıcının en eski üyeliği (ilk kurduğu firma).
        // İleride firma değiştirme (switch) bunun üzerine kurulacak.
        const membership = await prisma.membership.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
        });

        return {
          id: user.id,
          email: user.email,
          activeCompanyId: membership?.companyId ?? null,
          role: membership?.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    // Giriş anında (user dolu) tenant bilgisini token'a yaz.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.activeCompanyId = user.activeCompanyId;
        token.role = user.role;
      }
      return token;
    },
    // Token'daki tenant bilgisini istemciye açılan session'a taşı.
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.activeCompanyId = token.activeCompanyId;
      session.user.role = token.role;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
