"use client";

import { useState } from "react";
import { ClinicInfoForm, type Clinic } from "./clinic-info-form";
import { RateCardManager, type RateCard } from "./rate-card-manager";
import {
  LandingPagesManager,
  type LandingPageRow,
} from "./landing-pages-manager";

type Tab = "clinic" | "rates" | "landing";

export function SettingsTabs({
  clinic,
  rateCards,
  landingPages,
  bookingSlug,
}: {
  clinic: Clinic;
  rateCards: RateCard[];
  landingPages: LandingPageRow[];
  bookingSlug: string | null;
}) {
  const [tab, setTab] = useState<Tab>("clinic");

  const tabClass = (t: Tab) =>
    `flex h-11 items-center rounded-button px-4 text-[15px] font-medium ${
      tab === t
        ? "bg-primary/10 text-primary"
        : "text-text-secondary hover:bg-subtle"
    }`;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tabClass("clinic")} onClick={() => setTab("clinic")}>
          Clinic Info
        </button>
        <button type="button" className={tabClass("rates")} onClick={() => setTab("rates")}>
          Rate Card
        </button>
        <button type="button" className={tabClass("landing")} onClick={() => setTab("landing")}>
          Landing Pages
        </button>
      </div>

      <div className="mt-6">
        {tab === "clinic" ? (
          <ClinicInfoForm clinic={clinic} />
        ) : tab === "rates" ? (
          <RateCardManager rateCards={rateCards} />
        ) : (
          <LandingPagesManager pages={landingPages} bookingSlug={bookingSlug} />
        )}
      </div>
    </div>
  );
}
