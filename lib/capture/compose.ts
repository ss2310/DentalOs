import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { h, renderElementToPng, RENDER_BUCKET, type El } from "@/lib/social/render";

// Moment Capture composer (S2) — REAL patient photos, UNMODIFIED (no filters,
// no retouching, no AI: photos are embedded as-is; only layout/cropping-to-
// frame is applied), placed into branded templates. Every template draws the
// "Actual patient — shared with consent" line INTO the PNG — it is
// non-removable by construction, not by policy. Composition costs 0 credits.

export const CONSENT_LINE = "Actual patient — shared with consent";
export const CAPTURE_BUCKET = "capture-photos";

export const COMPOSE_TEMPLATES = ["before_after", "result_hero"] as const;
export type ComposeTemplate = (typeof COMPOSE_TEMPLATES)[number];
export const COMPOSE_FORMATS = ["feed", "story"] as const;
export type ComposeFormat = (typeof COMPOSE_FORMATS)[number];

const DIMS: Record<ComposeFormat, { w: number; h: number }> = {
  feed: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

type Kit = {
  primary_color: string;
  secondary_color: string;
  font: "inter" | "poppins" | "lora";
};
const DEFAULT_KIT: Kit = { primary_color: "#0D9488", secondary_color: "#1D1D1F", font: "inter" };

type ClinicLite = { business_name: string | null; area: string | null; city: string | null };

async function photoDataUri(
  admin: SupabaseClient,
  path: string,
): Promise<string> {
  const { data: blob, error } = await admin.storage.from(CAPTURE_BUCKET).download(path);
  if (error || !blob) throw new Error(`Could not load photo: ${error?.message ?? path}`);
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/jpeg"};base64,${buf.toString("base64")}`;
}

function img(src: string, style: Record<string, unknown>): El {
  return { type: "img", props: { src, style } };
}

// The non-removable footer: consent line (always) + clinic identity.
function consentFooter(kit: Kit, clinic: ClinicLite): El {
  const place = [clinic.area, clinic.city].filter(Boolean).join(", ");
  return h(
    "div",
    {
      display: "flex", flexDirection: "column", gap: 10,
      padding: "28px 56px 40px 56px", backgroundColor: "#FFFFFF",
    },
    [
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
        h("div", { fontSize: 30, fontWeight: 700, color: kit.secondary_color }, clinic.business_name ?? "Clinic"),
        h("div", { fontSize: 24, color: "#6E6E73" }, place),
      ]),
      h("div", {
        fontSize: 24, color: kit.primary_color, fontWeight: 700,
        letterSpacing: "0.02em",
      }, `✓ ${CONSENT_LINE}`),
    ],
  );
}

function label(text: string, kit: Kit): El {
  return h("div", {
    position: "absolute", left: 24, top: 24,
    backgroundColor: "#FFFFFFE6", color: kit.secondary_color,
    fontSize: 26, fontWeight: 700, padding: "8px 22px", borderRadius: 999,
    letterSpacing: "0.06em",
  }, text);
}

/** Side-by-side (feed) / stacked (story) before/after. Photos untouched. */
function beforeAfter(
  kit: Kit,
  clinic: ClinicLite,
  fmt: ComposeFormat,
  beforeUri: string,
  afterUri: string,
  treatment: string | null,
): El {
  const { w, h: H } = DIMS[fmt];
  const row = fmt === "feed";
  const pane = (uri: string, tag: string) =>
    h("div", { position: "relative", display: "flex", flexGrow: 1, overflow: "hidden" }, [
      img(uri, { width: "100%", height: "100%", objectFit: "cover" }),
      label(tag, kit),
    ]);
  return h(
    "div",
    { width: w, height: H, display: "flex", flexDirection: "column", backgroundColor: "#FFFFFF", fontFamily: "Brand" },
    [
      ...(treatment
        ? [h("div", {
            padding: "30px 56px", fontSize: 36, fontWeight: 700,
            color: kit.secondary_color, letterSpacing: "-0.02em",
          }, treatment)]
        : []),
      h("div", { display: "flex", flexDirection: row ? "row" : "column", flexGrow: 1, gap: 6 }, [
        pane(beforeUri, "BEFORE"),
        pane(afterUri, "AFTER"),
      ]),
      consentFooter(kit, clinic),
    ],
  );
}

/** Single result photo, hero-sized, brand band + consent footer. */
function resultHero(
  kit: Kit,
  clinic: ClinicLite,
  fmt: ComposeFormat,
  afterUri: string,
  treatment: string | null,
): El {
  const { w, h: H } = DIMS[fmt];
  return h(
    "div",
    { width: w, height: H, display: "flex", flexDirection: "column", backgroundColor: "#FFFFFF", fontFamily: "Brand" },
    [
      h("div", {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backgroundColor: kit.primary_color, padding: "26px 56px",
      }, [
        h("div", { fontSize: 34, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.02em" },
          treatment ?? "A smile we're proud of"),
      ]),
      h("div", { position: "relative", display: "flex", flexGrow: 1, overflow: "hidden" }, [
        img(afterUri, { width: "100%", height: "100%", objectFit: "cover" }),
      ]),
      consentFooter(kit, clinic),
    ],
  );
}

export type ComposeInput = {
  momentId: string;
  clinicId: string;
  template: ComposeTemplate;
  formats: ComposeFormat[];
  afterPhotoPath: string;
  beforePhotoPath: string | null;
  treatment: string | null;
};

/**
 * Compose the branded asset(s) and upload to social-renders under the moment's
 * folder. Returns storage paths (one per requested format). Throws if the
 * before/after template is asked for without a before photo.
 */
export async function composeMomentImages(
  admin: SupabaseClient,
  clinic: ClinicLite,
  kit: Kit | null,
  input: ComposeInput,
): Promise<string[]> {
  const brand = kit ?? DEFAULT_KIT;
  if (input.template === "before_after" && !input.beforePhotoPath) {
    throw new Error("This moment has no 'before' photo — use the result template.");
  }

  const afterUri = await photoDataUri(admin, input.afterPhotoPath);
  const beforeUri = input.beforePhotoPath
    ? await photoDataUri(admin, input.beforePhotoPath)
    : null;

  const paths: string[] = [];
  for (const fmt of input.formats) {
    const el =
      input.template === "before_after"
        ? beforeAfter(brand, clinic, fmt, beforeUri!, afterUri, input.treatment)
        : resultHero(brand, clinic, fmt, afterUri, input.treatment);
    const { w, h: H } = DIMS[fmt];
    const png = await renderElementToPng(el, brand, w, H);
    const p = `${input.clinicId}/moment-${input.momentId}/${input.template}-${fmt}.png`;
    const { error } = await admin.storage
      .from(RENDER_BUCKET)
      .upload(p, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Compose upload failed: ${error.message}`);
    paths.push(p);
  }
  return paths;
}
