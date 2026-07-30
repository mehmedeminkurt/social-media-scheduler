import { z } from "zod";

import { SUPPORTED_PUBLISH_PLATFORMS } from "@/lib/publishers/publisher";

export const captionSuggestSchema = z.object({
  topic: z
    .string()
    .trim()
    .max(500, "Konu en fazla 500 karakter olabilir.")
    .optional(),
  platforms: z
    .array(z.enum(SUPPORTED_PUBLISH_PLATFORMS))
    .min(1, "En az bir platform seçilmelidir."),
  brandKitId: z.string().uuid().optional().nullable(),
  mediaHint: z
    .string()
    .trim()
    .max(300, "Medya ipucu en fazla 300 karakter olabilir.")
    .optional(),
});

export type CaptionSuggestInput = z.infer<typeof captionSuggestSchema>;
