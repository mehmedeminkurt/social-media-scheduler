import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(
      1,
      "DATABASE_URL is required. Copy .env.example to .env and configure your database.",
    ),
  NEXTAUTH_SECRET: z
    .string()
    .min(
      1,
      "NEXTAUTH_SECRET is required. Generate one with: openssl rand -base64 32",
    ),
  ENCRYPTION_KEY: z
    .string()
    .min(
      1,
      "ENCRYPTION_KEY is required. Generate a base64 key.",
    ),
});

function validateServerEnv() {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  });

  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.message}`);
    throw new Error(
      `Environment configuration error:\n${lines.join("\n")}\n\nSee apps/frontend/.env.example for required variables.`,
    );
  }

  return result.data;
}

export const serverEnv = validateServerEnv();
