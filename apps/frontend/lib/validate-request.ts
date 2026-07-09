import type { ZodSchema } from "zod";
import { apiError } from "./api-response-server";

export function validateBody<T>(schema: ZodSchema<T>, body: unknown) {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    // Optional chaining (?) ve nullish coalescing (??) kullanarak güvenli hale getirdik
    const errorMessage = parsed.error.issues[0]?.message ?? "Geçersiz girdi";
    return { ok: false as const, response: apiError(errorMessage, 400) };
  }

  return { ok: true as const, data: parsed.data };
}