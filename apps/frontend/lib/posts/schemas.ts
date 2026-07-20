import { z } from "zod";

import { SUPPORTED_PUBLISH_PLATFORMS } from "@/lib/publishers/publisher";

const publishPlatformSchema = z.enum(SUPPORTED_PUBLISH_PLATFORMS);

export const createPostSchema = z.object({
  caption: z
    .string()
    .trim()
    .min(1, "Açıklama boş olamaz.")
    .max(2200, "Açıklama en fazla 2200 karakter olabilir."),
  platforms: z
    .array(publishPlatformSchema)
    .min(1, "En az bir platform seçilmelidir.")
    .refine((platforms) => new Set(platforms).size === platforms.length, {
      message: "Aynı platform birden fazla kez seçilemez.",
    }),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
