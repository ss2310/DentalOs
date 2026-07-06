// One-shot: generate public/icon-192.png + icon-512.png for the PWA manifest.
// Teal rounded square + white tooth mark (the sidebar's ToothIcon path), Inter.
// Run: node scripts/make-icons.mjs   (safe to re-run; overwrites)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const inter = readFileSync("assets/fonts/Inter-Bold.ttf");

// Simplified tooth outline (matches components/icons.tsx ToothIcon geometry).
const TOOTH_PATH =
  "M12 3C9.5 3 8.5 4.5 7 4.5 5 4.5 3.5 6 3.5 8.5c0 2 .8 3.2 1.6 4.6.7 1.2 1.2 3.3 1.4 5.4.1 1.2.7 2.5 1.8 2.5 1.8 0 1.2-4.5 3.7-4.5s1.9 4.5 3.7 4.5c1.1 0 1.7-1.3 1.8-2.5.2-2.1.7-4.2 1.4-5.4.8-1.4 1.6-2.6 1.6-4.6C20.5 6 19 4.5 17 4.5c-1.5 0-2.5-1.5-5-1.5z";

async function make(size) {
  const el = {
    type: "div",
    props: {
      style: {
        width: size, height: size, display: "flex",
        alignItems: "center", justifyContent: "center",
        backgroundColor: "#0D9488", borderRadius: size * 0.22,
      },
      children: [
        {
          type: "svg",
          props: {
            width: size * 0.62, height: size * 0.62, viewBox: "0 0 24 24",
            children: [
              {
                type: "path",
                props: { d: TOOTH_PATH, fill: "#FFFFFF" },
              },
            ],
          },
        },
      ],
    },
  };
  const svg = await satori(el, {
    width: size, height: size,
    fonts: [{ name: "Inter", data: inter, weight: 700, style: "normal" }],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", await make(192));
writeFileSync("public/icon-512.png", await make(512));
console.log("wrote public/icon-192.png + public/icon-512.png");
