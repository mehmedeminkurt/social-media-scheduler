import { z } from "zod";

export const brandKitSchema = z.object({
  name: z.string().trim().min(1, "İsim boş olamaz."),
  logoUrl: z.string().url().nullable().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)"),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)").optional().nullable(),
    background: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)").optional().nullable(),
  }),
  // Vocabulary must match the render engine (lib/branding/engine.ts) and the
  // settings UI: template is watermark | slim-bar, with margin/showPill/barHeight.
  overlayConfig: z.object({
    template: z.enum(["watermark", "slim-bar"]),
    position: z.enum(["top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"]),
    logoSize: z.number().min(10).max(500).optional().nullable(),
    opacity: z.number().min(0).max(1).optional().nullable(),
    margin: z.number().min(0).max(300).optional().nullable(),
    showPill: z.boolean().optional().nullable(),
    barHeight: z.number().min(10).max(500).optional().nullable(),
  }),
});

export type BrandKitInput = z.infer<typeof brandKitSchema>;
