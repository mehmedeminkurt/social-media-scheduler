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
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required. Generate a base64 key.").refine((val) => {
  try {
    const buffer = Buffer.from(val, "base64");
    return buffer.length === 32;
  } catch {
    return false;
  }
}, "ENCRYPTION_KEY must be a valid base64-encoded 32-byte key. Generate one using: openssl rand -base64 32"),
  S3_ENDPOINT: z
    .string()
    .url("S3_ENDPOINT must be a valid URL (e.g. https://<account_id>.r2.cloudflarestorage.com)."),
  S3_ACCESS_KEY_ID: z
    .string()
    .min(1, "S3_ACCESS_KEY_ID is required for object storage."),
  S3_SECRET_ACCESS_KEY: z
    .string()
    .min(1, "S3_SECRET_ACCESS_KEY is required for object storage."),
  S3_REGION: z
    .string()
    .min(1, "S3_REGION is required (use 'auto' for Cloudflare R2)."),
  S3_BUCKET_NAME: z
    .string()
    .min(1, "S3_BUCKET_NAME is required for object storage."),
  S3_PUBLIC_BASE_URL: z
    .string()
    .url("S3_PUBLIC_BASE_URL must be a valid public URL prefix for uploaded media.")
    .refine(
      (val) => !val.endsWith("/"),
      "S3_PUBLIC_BASE_URL must not end with a trailing slash.",
    ),
});

function validateServerEnv() {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
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
