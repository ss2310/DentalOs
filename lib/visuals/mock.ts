import "server-only";

import { h, renderElementToPng } from "@/lib/social/render";
import type { ImageProvider } from "./types";

// Keyless deterministic provider (default, same posture as lib/serp/mock.ts):
// a soft two-tone gradient rendered with the satori engine we already ship.
// Obviously synthetic on sight, so a dev can never mistake it for a real
// premium backdrop — production must set IMAGE_PROVIDER (see index.ts).
export const mockImageProvider: ImageProvider = {
  name: "mock",
  isConfigured: () => true,
  async generate({ width, height }) {
    const el = h(
      "div",
      {
        width,
        height,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: 40,
        backgroundImage: "linear-gradient(160deg, #134E4A 0%, #0D9488 55%, #99F6E4 100%)",
        fontFamily: "Brand",
      },
      [h("div", { fontSize: 28, color: "#FFFFFF80" }, "mock backdrop")],
    );
    return renderElementToPng(el, { font: "inter" }, width, height);
  },
};
