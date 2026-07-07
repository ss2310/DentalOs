import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// One family everywhere ("Clinical Minimal") — display sizes are the same face
// tightened with tracking/weight, so the whole UI reads as a single voice.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for OG/share links (falls back safely in dev).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "GrowthOS",
  description:
    "Practice management and AI marketing for Indian dental clinics.",
};

export const viewport: Viewport = {
  themeColor: "#0D9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
