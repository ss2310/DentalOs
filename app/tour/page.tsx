import type { Metadata } from "next";
import { ProductTour } from "@/components/tour/product-tour";

export const metadata: Metadata = {
  title: "See how GrowthOS works",
  description:
    "A 60-second interactive walkthrough of GrowthOS — capture every enquiry, follow up on WhatsApp, and win back revenue, all from one screen.",
};

// Public marketing demo. Self-contained: renders a faux GrowthOS screen and a
// user-driven guided tour over it. No auth, no real data (added to the
// middleware public paths).
export default function TourPage() {
  return (
    <main className="min-h-screen bg-subtle">
      <ProductTour />
    </main>
  );
}
