import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarouselSlide } from "@/lib/social/generate";

// Template image renderer — COMPOSITION ONLY (zero AI images): clinic logo +
// brand colors + slide copy laid out with satori (spike-verified: ~1.4s per
// 1080x1080 PNG, pure JS + prebuilt resvg binary, Vercel-safe). Costs zero
// credits. Fonts are bundled TTFs (assets/fonts) read relative to
// process.cwd() so Vercel's file tracing includes them.
//
// PHASE-2 SEAM (Moment Capture): social_posts.image_source is 'template'-only
// today. When the gallery picker lands, widen the DB CHECK, add
// image_source='moment_capture', and branch HERE to compose a photo layout —
// the storage/signing flow below stays identical. Phase-1 hard filter: no
// identifiable patients, no clinical imagery — guaranteed by construction
// (only logo + colors + text ever enter the canvas).

export const RENDER_BUCKET = "social-renders";
const SIZE = 1080;

type BrandKit = {
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
  font: "inter" | "poppins" | "lora";
};

export const DEFAULT_BRAND_KIT: BrandKit = {
  logo_path: null,
  primary_color: "#0D9488",
  secondary_color: "#1D1D1F",
  font: "inter",
};

type ClinicLite = {
  business_name: string | null;
  area: string | null;
  city: string | null;
};

// Inter has no emoji glyphs; satori draws NOGLYPH boxes for them. Images stay
// text-clean — emoji live in the caption, not the card.
const EMOJI_RE = new RegExp("\\p{Extended_Pictographic}|\\uFE0F|\\u200D", "gu");
function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

// --- fonts (cached per lambda instance) -------------------------------------
const FONT_FILES: Record<BrandKit["font"], { regular: string; bold: string }> = {
  inter: { regular: "Inter-Regular.ttf", bold: "Inter-Bold.ttf" },
  poppins: { regular: "Poppins-Regular.ttf", bold: "Poppins-SemiBold.ttf" },
  lora: { regular: "Lora-Regular.ttf", bold: "Lora-Regular.ttf" },
};
const fontCache = new Map<string, Buffer>();
async function font(file: string): Promise<Buffer> {
  const hit = fontCache.get(file);
  if (hit) return hit;
  const data = await readFile(path.join(process.cwd(), "assets", "fonts", file));
  fontCache.set(file, data);
  return data;
}

// --- tiny element helper (satori takes React-shaped plain objects) ----------
// Exported for the Moment Capture composer (lib/capture/compose.ts), which
// builds its own photo layouts on the same engine.
export type El = { type: string; props: Record<string, unknown> };
export function h(
  type: string,
  style: Record<string, unknown>,
  children?: El[] | string,
): El {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

function logoChip(
  kit: BrandKit,
  clinic: ClinicLite,
  logoDataUri: string | null,
  inverse = false,
): El {
  const name = clinic.business_name ?? "Clinic";
  const mark = logoDataUri
    ? {
        type: "img",
        props: {
          src: logoDataUri,
          width: 72,
          height: 72,
          style: { borderRadius: 18, objectFit: "contain" },
        },
      }
    : h(
        "div",
        {
          width: 72, height: 72, borderRadius: 18,
          backgroundColor: inverse ? "#FFFFFF2E" : `${kit.primary_color}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, fontWeight: 700,
          color: inverse ? "#FFFFFF" : kit.primary_color,
        },
        name.slice(0, 1).toUpperCase(),
      );
  return h(
    "div",
    { display: "flex", alignItems: "center", gap: 22 },
    [mark as El, h("div", { fontSize: 32, color: inverse ? "#FFFFFFCC" : "#6E6E73" }, name)],
  );
}

function footer(kit: BrandKit, clinic: ClinicLite, cta: string, inverse = false): El {
  const place = [clinic.area, clinic.city].filter(Boolean).join(", ");
  return h(
    "div",
    {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingTop: 36,
      borderTop: `2px solid ${inverse ? "#FFFFFF33" : "#E8EAED"}`,
      fontSize: 29,
    },
    [
      h("div", { color: inverse ? "#FFFFFF" : kit.primary_color, fontWeight: 700 }, cta),
      h("div", { color: inverse ? "#FFFFFFB3" : "#6E6E73" }, place),
    ],
  );
}

// --- the layouts (3 clean compositions + a CTA closer) ----------------------
// hero: white card, big ink headline (the spike layout).
function layoutHero(kit: BrandKit, clinic: ClinicLite, logo: string | null, title: string, body?: string): El {
  return h(
    "div",
    {
      width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: 80,
      backgroundColor: "#FFFFFF", fontFamily: "Brand",
    },
    [
      logoChip(kit, clinic, logo),
      h("div", { display: "flex", flexDirection: "column", gap: 30 }, [
        h("div", {
          fontSize: title.length > 70 ? 58 : 72, fontWeight: 700,
          color: kit.secondary_color, lineHeight: 1.15, letterSpacing: "-0.02em",
        }, title),
        ...(body
          ? [h("div", { fontSize: 36, color: "#6E6E73", lineHeight: 1.45 }, body)]
          : []),
      ]),
      footer(kit, clinic, "Aaj hi baat kariye"),
    ],
  );
}

// band: primary-color band at the top, content below — offer/announcement feel.
function layoutBand(kit: BrandKit, clinic: ClinicLite, logo: string | null, title: string, body?: string, badge?: string): El {
  return h(
    "div",
    {
      width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
      backgroundColor: "#FFFFFF", fontFamily: "Brand",
    },
    [
      h("div", {
        display: "flex", flexDirection: "column", gap: 24,
        backgroundColor: kit.primary_color, padding: "70px 80px 56px 80px",
      }, [
        ...(badge
          ? [h("div", {
              alignSelf: "flex-start", fontSize: 26, fontWeight: 700, color: kit.primary_color,
              backgroundColor: "#FFFFFF", borderRadius: 999, padding: "10px 28px",
              letterSpacing: "0.06em",
            }, badge.toUpperCase())]
          : []),
        h("div", {
          fontSize: title.length > 70 ? 54 : 66, fontWeight: 700, color: "#FFFFFF",
          lineHeight: 1.15, letterSpacing: "-0.02em",
        }, title),
      ]),
      h("div", {
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        flexGrow: 1, padding: "56px 80px 80px 80px",
      }, [
        body
          ? h("div", { fontSize: 38, color: kit.secondary_color, lineHeight: 1.5 }, body)
          : h("div", {}),
        h("div", { display: "flex", flexDirection: "column", gap: 36 }, [
          logoChip(kit, clinic, logo),
          footer(kit, clinic, "WhatsApp par message kariye"),
        ]),
      ]),
    ],
  );
}

// inverse: full primary-color card, white type — the hook/CTA slides.
function layoutInverse(kit: BrandKit, clinic: ClinicLite, logo: string | null, title: string, body?: string, slideNo?: string): El {
  return h(
    "div",
    {
      width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: 80,
      backgroundColor: kit.primary_color, fontFamily: "Brand",
    },
    [
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
        logoChip(kit, clinic, logo, true),
        ...(slideNo
          ? [h("div", { fontSize: 30, color: "#FFFFFFB3", fontWeight: 700 }, slideNo)]
          : []),
      ]),
      h("div", { display: "flex", flexDirection: "column", gap: 30 }, [
        h("div", {
          fontSize: title.length > 70 ? 58 : 74, fontWeight: 700, color: "#FFFFFF",
          lineHeight: 1.12, letterSpacing: "-0.02em",
        }, title),
        ...(body
          ? [h("div", { fontSize: 36, color: "#FFFFFFD9", lineHeight: 1.45 }, body)]
          : []),
      ]),
      footer(kit, clinic, "Abhi WhatsApp kariye", true),
    ],
  );
}

// aiHero: the PREMIUM hybrid — an AI-generated photo backdrop behind the same
// brand overlay (logo chip, headline, footer) in white over a bottom-up scrim.
// Always a composition, never a raw AI image: image models can't render
// Hinglish reliably and the brand lockup must be exact (PREMIUM-VISUALS spec).
function layoutAiHero(
  kit: BrandKit,
  clinic: ClinicLite,
  logo: string | null,
  bgDataUri: string,
  title: string,
  body?: string,
  slideNo?: string,
): El {
  const bg: El = {
    type: "img",
    props: {
      src: bgDataUri,
      width: SIZE,
      height: SIZE,
      style: { position: "absolute", top: 0, left: 0, objectFit: "cover" },
    },
  };
  const scrim = h("div", {
    position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE,
    backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.16) 45%, rgba(0,0,0,0.60) 100%)",
  });
  const overlay = h(
    "div",
    {
      position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: 80,
    },
    [
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
        logoChip(kit, clinic, logo, true),
        ...(slideNo
          ? [h("div", { fontSize: 30, color: "#FFFFFFB3", fontWeight: 700 }, slideNo)]
          : []),
      ]),
      h("div", { display: "flex", flexDirection: "column", gap: 30 }, [
        h("div", {
          fontSize: title.length > 70 ? 56 : 70, fontWeight: 700, color: "#FFFFFF",
          lineHeight: 1.12, letterSpacing: "-0.02em",
        }, title),
        ...(body
          ? [h("div", { fontSize: 36, color: "#FFFFFFE0", lineHeight: 1.45 }, body)]
          : []),
      ]),
      footer(kit, clinic, "Abhi WhatsApp kariye", true),
    ],
  );
  return h(
    "div",
    { width: SIZE, height: SIZE, display: "flex", position: "relative", fontFamily: "Brand" },
    [bg, scrim, overlay],
  );
}

export const SINGLE_LAYOUTS = ["hero", "band", "inverse"] as const;
export type SingleLayout = (typeof SINGLE_LAYOUTS)[number];

// --- rendering ----------------------------------------------------------------
/** Render one element tree to PNG at the given dimensions (font = brand kit's). */
export async function renderElementToPng(
  el: El,
  kit: Pick<BrandKit, "font">,
  width: number,
  height: number,
): Promise<Buffer> {
  const files = FONT_FILES[kit.font] ?? FONT_FILES.inter;
  const svg = await satori(el as never, {
    width,
    height,
    fonts: [
      { name: "Brand", data: await font(files.regular), weight: 400, style: "normal" },
      { name: "Brand", data: await font(files.bold), weight: 700, style: "normal" },
    ],
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}

async function toPng(el: El, kit: BrandKit): Promise<Buffer> {
  return renderElementToPng(el, kit, SIZE, SIZE);
}

/** First sentence/line of the caption as the card headline (emoji-stripped). */
export function headlineFromCaption(caption: string): string {
  const firstLine = String(caption ?? "").split(/\n/)[0] ?? "";
  const cleaned = stripEmoji(firstLine.replace(/#[\w]+/g, "")).trim();
  const short = cleaned.length > 110 ? `${cleaned.slice(0, 107).replace(/\s+\S*$/, "")}…` : cleaned;
  return short || "Ek chhota sa reminder aapke liye";
}

export type RenderInput = {
  postId: string;
  clinicId: string;
  format: "single" | "carousel";
  caption: string;
  slides: CarouselSlide[] | null;
  campaignType?: string | null;
  layout?: SingleLayout;
  // Premium hybrid: an AI-generated backdrop as a data URI. When set, every
  // page uses the aiHero layout over this ONE background (a carousel reuses
  // it across all slides — one generation per run, by design).
  premiumBg?: string;
};

/**
 * Render a post's image(s), upload to the clinic-scoped social-renders bucket
 * (service-role client — the bucket has no client write policy) and return the
 * storage paths. Single → 1 PNG; carousel → 6 (hook=inverse, 2–5=hero/band
 * alternating, 6=CTA inverse). Zero credits.
 */
export async function renderPostImages(
  admin: SupabaseClient,
  clinic: ClinicLite,
  kit: BrandKit | null,
  input: RenderInput,
): Promise<string[]> {
  const brand = kit ?? DEFAULT_BRAND_KIT;

  // Logo: fetch from brand-assets and inline as a data URI (satori needs bytes).
  let logoDataUri: string | null = null;
  if (brand.logo_path) {
    const { data: blob } = await admin.storage
      .from("brand-assets")
      .download(brand.logo_path);
    if (blob) {
      const type = blob.type || "image/png";
      // satori decodes png/jpeg data URIs; skip svg/webp logos rather than crash.
      if (/png|jpe?g/i.test(type)) {
        const buf = Buffer.from(await blob.arrayBuffer());
        logoDataUri = `data:${type};base64,${buf.toString("base64")}`;
      }
    }
  }

  const pages: El[] = [];
  if (input.format === "carousel" && (input.slides?.length ?? 0) > 0) {
    const slides = (input.slides ?? []).slice(0, 6);
    slides.forEach((s, i) => {
      const title = stripEmoji(s.title);
      const body = stripEmoji(s.body);
      const no = `${i + 1}/${slides.length}`;
      if (input.premiumBg)
        pages.push(layoutAiHero(brand, clinic, logoDataUri, input.premiumBg, title, body, no));
      else if (i === 0) pages.push(layoutInverse(brand, clinic, logoDataUri, title, body, no));
      else if (i === slides.length - 1)
        pages.push(layoutInverse(brand, clinic, logoDataUri, title, body, no));
      else if (i % 2 === 1) pages.push(layoutHero(brand, clinic, logoDataUri, title, body));
      else pages.push(layoutBand(brand, clinic, logoDataUri, title, body));
    });
  } else {
    const title = headlineFromCaption(input.caption);
    const layout = input.layout ?? "hero";
    const badge = input.campaignType ? stripEmoji(input.campaignType).slice(0, 24) : undefined;
    if (input.premiumBg)
      pages.push(layoutAiHero(brand, clinic, logoDataUri, input.premiumBg, title));
    else if (layout === "band") pages.push(layoutBand(brand, clinic, logoDataUri, title, undefined, badge));
    else if (layout === "inverse") pages.push(layoutInverse(brand, clinic, logoDataUri, title));
    else pages.push(layoutHero(brand, clinic, logoDataUri, title));
  }

  const paths: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const png = await toPng(pages[i], brand);
    const p = `${input.clinicId}/${input.postId}/${i + 1}.png`;
    const { error } = await admin.storage
      .from(RENDER_BUCKET)
      .upload(p, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Render upload failed: ${error.message}`);
    paths.push(p);
  }
  return paths;
}
