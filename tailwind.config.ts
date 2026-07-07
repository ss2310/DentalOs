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
        // GrowthOS design system — "Clinical Minimal" (see CLAUDE.md).
        // Neutral, near-invisible chrome; teal appears ONLY as the accent.
        primary: "#0D9488", // teal — the single accent (actions, active states, key numbers)
        ink: "#1D1D1F", // near-black ink (legacy token; now maps to primary text)
        mint: "#2DD4BF", // legacy accent — avoid in new work; kept for compat
        success: "#059669",
        warning: "#D97706",
        danger: "#DC2626",
        border: "#E8EAED", // neutral hairline — barely-there
        text: {
          primary: "#1D1D1F",
          secondary: "#6E6E73",
        },
        subtle: "#F5F5F7", // neutral canvas
      },
      fontFamily: {
        // One family everywhere — Inter. "Display" is the same face, tightened
        // with tracking/weight at the point of use, so titles and numbers feel
        // like the UI rather than a second voice.
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        button: "10px",
        pill: "999px",
      },
      boxShadow: {
        // A whisper of lift — diffuse and neutral, never heavy.
        card: "0 1px 2px rgba(0, 0, 0, 0.03), 0 8px 24px -12px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
