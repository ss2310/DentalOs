import type { MetadataRoute } from "next";

// Android-Chrome-first product: a proper manifest gives clinics a real
// "Add to Home screen" install (name, teal theme, standalone window).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GrowthOS",
    short_name: "GrowthOS",
    description: "Practice management and AI marketing for Indian clinics.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0D9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
