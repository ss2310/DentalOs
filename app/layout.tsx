import type { Metadata } from "next";
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
  title: "GrowthOS",
  description:
    "Practice management and AI marketing for Indian dental clinics.",
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
