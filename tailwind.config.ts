import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // GrowthOS design system — "Clinical Fresh" (see CLAUDE.md)
        primary: "#0D9488", // teal-600 — brand + primary actions
        ink: "#0B2E2B", // deep teal — the sidebar rail
        mint: "#2DD4BF", // bright accent — active states, highlights
        success: "#059669",
        warning: "#D97706",
        danger: "#DC2626",
        border: "#E2E8F0", // cool slate hairline
        text: {
          primary: "#0F172A",
          secondary: "#64748B",
        },
        subtle: "#F5F9F8", // faint teal-tinted canvas
      },
      fontFamily: {
        // Inter for body/UI (accessible); Sora for display titles + big numbers.
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        button: "10px",
        pill: "999px",
      },
      boxShadow: {
        // A whisper of lift — never heavy.
        card: "0 1px 2px rgba(2, 44, 40, 0.04), 0 6px 16px -6px rgba(2, 44, 40, 0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
