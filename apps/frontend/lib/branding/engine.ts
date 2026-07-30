import sharp from "sharp";

import { isStorageUrl } from "@/lib/storage/media";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface BrandKitData {
  /** Brand colours: { primary, secondary, background } */
  colors: Record<string, string>;
  /** See OverlayConfig */
  overlayConfig: Record<string, unknown>;
  /** Logo public URL (null = no logo) */
  logoUrl: string | null;
}

/**
 * Overlay configuration stored as JSON in the DB.
 *
 * template:
 *   "watermark" — logo placed in a corner of the image, no heavy background.
 *                 Optional ultra-subtle rounded pill behind the logo.
 *   "slim-bar"  — a thin, elegant bar (40-60 px) at the top or bottom of the
 *                 image, semi-transparent, logo aligned inside it.
 *
 * position:
 *   watermark → "bottom-right" | "bottom-left" | "top-right" | "top-left"
 *   slim-bar  → "bottom" | "top"
 */
export interface OverlayConfig {
  template: "watermark" | "slim-bar";
  position: string;
  /** Logo size in px (both templates). Default 56. */
  logoSize: number;
  /** Overall opacity 0–1 applied to the whole overlay layer. Default 0.85. */
  opacity: number;
  /** Margin from edge in px (watermark). Default 24. */
  margin: number;
  /** Show a subtle rounded-pill background behind the logo (watermark only). Default false. */
  showPill: boolean;
  /** Slim-bar height in px. Default 56. */
  barHeight: number;
}

const CONFIG_DEFAULTS: OverlayConfig = {
  template: "watermark",
  position: "bottom-right",
  logoSize: 56,
  opacity: 0.85,
  margin: 24,
  showPill: false,
  barHeight: 56,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Apply opacity to an image buffer by directly scaling the alpha channel.
 * Works correctly for all PNG images regardless of their initial alpha state.
 */
async function withOpacity(buf: Buffer, opacity: number): Promise<Buffer> {
  if (opacity >= 1) return buf;

  // Decode to raw RGBA pixels
  const { data, info } = await sharp(buf)
    .ensureAlpha()      // guarantee 4-channel RGBA
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Scale every alpha byte (index 3, 7, 11, …) by opacity
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i]! * opacity);
  }

  // Re-encode as PNG with updated alpha
  return sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Resize a logo buffer to fit within maxW×maxH while keeping aspect ratio.
 * Returns { buf, w, h }.
 */
async function fitLogo(
  buf: Buffer,
  maxW: number,
  maxH: number,
): Promise<{ buf: Buffer; w: number; h: number }> {
  const resized = await sharp(buf)
    .resize(maxW, maxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const { width = maxW, height = maxH } = await sharp(resized).metadata();
  return { buf: resized, w: width, h: height };
}

/** Build a rounded-pill SVG background (very subtle). */
function pillSvg(w: number, h: number, fill: string, fillOpacity: number) {
  const rx = Math.round(h / 2);
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" rx="${rx}" ry="${rx}"
            fill="${fill}" fill-opacity="${fillOpacity.toFixed(2)}"/>
    </svg>`,
  );
}

/** Build a slim-bar SVG (semi-transparent solid). */
function barSvg(w: number, h: number, fill: string, fillOpacity: number) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}"
            fill="${fill}" fill-opacity="${fillOpacity.toFixed(2)}"/>
    </svg>`,
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Apply brand kit to an image buffer.
 *
 * @param imageBuffer   Raw image bytes (JPEG / PNG / WebP).
 * @param brandKit      Brand kit data from the DB.
 * @param aspectRatio   Target aspect ratio ("1:1" | "4:5" | "9:16" | null).
 * @returns             High-quality JPEG buffer.
 */
export async function renderBrandedImage(
  imageBuffer: Buffer,
  brandKit: BrandKitData,
  aspectRatio?: string | null,
): Promise<Buffer> {
  // ── 1. Parse config ──────────────────────────────────────────────────────
  const raw = (brandKit.overlayConfig ?? {}) as Partial<OverlayConfig>;
  const cfg: OverlayConfig = { ...CONFIG_DEFAULTS, ...raw };

  const primary = (brandKit.colors as Record<string, string>)?.primary ?? "#4f46e5";

  // ── 2. Resize base image to target aspect ratio ─────────────────────────
  const aspectMap: Record<string, [number, number]> = {
    "1:1": [1080, 1080],
    "4:5": [1080, 1350],
    "9:16": [1080, 1920],
  };

  let [targetW, targetH] = aspectRatio && aspectMap[aspectRatio]
    ? aspectMap[aspectRatio]
    : [0, 0];

  let basePipeline = sharp(imageBuffer);

  if (targetW && targetH) {
    basePipeline = basePipeline.resize(targetW, targetH, {
      fit: "cover",
      position: "centre",
    });
  } else {
    const meta = await sharp(imageBuffer).metadata();
    targetW = meta.width ?? 1080;
    targetH = meta.height ?? 1080;
  }

  const baseBuffer = await basePipeline.png().toBuffer();

  // ── 3. Fetch and size logo ───────────────────────────────────────────────
  const composites: sharp.OverlayOptions[] = [];

  if (!brandKit.logoUrl) {
    // No logo — just return resized image as JPEG
    return sharp(baseBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  // SSRF guard: only ever fetch logos from our own storage. A logoUrl pointing
  // anywhere else (internal host, cloud metadata endpoint) is ignored, not fetched.
  if (!isStorageUrl(brandKit.logoUrl)) {
    console.warn("Brand kit: logoUrl is not a storage URL, skipping overlay.");
    return sharp(baseBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  let rawLogo: Buffer;
  try {
    rawLogo = await fetchBuffer(brandKit.logoUrl);
  } catch (err) {
    console.error("Brand kit: logo fetch failed, skipping overlay:", err);
    return sharp(baseBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  // ── 4. Build overlay per template ───────────────────────────────────────

  if (cfg.template === "watermark") {
    await buildWatermark(composites, rawLogo, cfg, primary, targetW, targetH);
  } else {
    await buildSlimBar(composites, rawLogo, cfg, primary, targetW, targetH);
  }

  // ── 5. Composite & export ────────────────────────────────────────────────
  if (composites.length === 0) {
    return sharp(baseBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  return sharp(baseBuffer)
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// ─── Template: Watermark ─────────────────────────────────────────────────────

async function buildWatermark(
  composites: sharp.OverlayOptions[],
  rawLogo: Buffer,
  cfg: OverlayConfig,
  primary: string,
  targetW: number,
  targetH: number,
): Promise<void> {
  const { logoSize, opacity, margin, showPill, position } = cfg;

  const { buf: logoBuf, w: logoW, h: logoH } = await fitLogo(
    rawLogo,
    logoSize,
    logoSize,
  );

  // Corner position
  const atRight = position.includes("right");
  const atBottom = position.includes("bottom");

  const logoLeft = atRight ? targetW - logoW - margin : margin;
  const logoTop = atBottom ? targetH - logoH - margin : margin;

  if (showPill) {
    // Ultra-subtle pill: small horizontal padding, very low opacity fill
    const pillPaddingX = 12;
    const pillPaddingY = 8;
    const pillW = logoW + pillPaddingX * 2;
    const pillH = logoH + pillPaddingY * 2;
    const pillLeft = logoLeft - pillPaddingX;
    const pillTop = logoTop - pillPaddingY;

    // Pill fill: very subtle — white at 25 % opacity for dark logos; or use primary at 20 %
    const pillInput = await sharp(pillSvg(pillW, pillH, "#ffffff", 0.22))
      .png()
      .toBuffer();

    composites.push({ input: pillInput, top: pillTop, left: pillLeft, blend: "over" });
  }

  // Logo itself with opacity
  const finalLogo = await withOpacity(logoBuf, opacity);
  composites.push({ input: finalLogo, top: logoTop, left: logoLeft, blend: "over" });
}

// ─── Template: Slim Bar ──────────────────────────────────────────────────────

async function buildSlimBar(
  composites: sharp.OverlayOptions[],
  rawLogo: Buffer,
  cfg: OverlayConfig,
  primary: string,
  targetW: number,
  targetH: number,
): Promise<void> {
  const { logoSize, opacity, barHeight, position } = cfg;

  // Bar is semi-transparent (primary colour at opacity, capped at 0.9)
  const barOpacity = Math.min(opacity, 0.9);
  const barTop = position === "top" ? 0 : targetH - barHeight;

  // Subtle bar background
  const barBuf = await sharp(barSvg(targetW, barHeight, primary, barOpacity))
    .png()
    .toBuffer();
  composites.push({ input: barBuf, top: barTop, left: 0, blend: "over" });

  // Logo sizing: respect logoSize from UI, but also cap to bar height so logo never overflows
  const maxLogoH = Math.min(logoSize, Math.round(barHeight * 0.8));
  // Allow wide budget horizontally (70 % of frame) so landscape logos look fine
  const maxLogoW = Math.round(targetW * 0.7);
  const { buf: logoBuf, w: logoW, h: logoH } = await fitLogo(
    rawLogo,
    maxLogoW,
    maxLogoH,
  );

  // Always centre the logo horizontally in the bar
  const logoLeft = Math.round((targetW - logoW) / 2);
  const logoTop = barTop + Math.round((barHeight - logoH) / 2);

  // Render logo at full opacity on top of the already-transparent bar
  composites.push({ input: logoBuf, top: logoTop, left: logoLeft, blend: "over" });
}
