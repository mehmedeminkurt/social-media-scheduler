import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;

// Kayıt, giriş bilgilerine ek olarak firma adını da ister (multi-tenant onboarding).
export const registerSchema = credentialsSchema.extend({
  companyName: z.string().min(2, "Firma adı en az 2 karakter olmalı"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const invalidInputMessage = "Geçersiz girdi";
