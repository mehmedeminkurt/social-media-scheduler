import { z } from "zod";

export const brandKitSchema = z.object({
  name: z.string().trim().min(1, "İsim boş olamaz."),
  logoUrl: z.string().url().nullable().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)"),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)").optional().nullable(),
    background: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Geçersiz renk kodu (örnek: #ffffff)").optional().nullable(),
  }),
  overlayConfig: z.object({
    template: z.enum(["template1", "template2"]),
    position: z.enum(["top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"]),
    barHeight: z.number().min(10).max(500).optional().nullable(),
    logoSize: z.number().min(10).max(500).optional().nullable(),
    opacity: z.number().min(0).max(1).optional().nullable(),
    padding: z.number().min(0).max(300).optional().nullable(),
    align: z.enum(["left", "center", "right"]).optional().nullable(),
  }),
});

export type BrandKitInput = z.infer<typeof brandKitSchema>;
