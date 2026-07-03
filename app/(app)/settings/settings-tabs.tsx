"use client";

import { useState } from "react";
import { ClinicInfoForm, type Clinic } from "./clinic-info-form";
import { RateCardManager, type RateCard } from "./rate-card-manager";

type Tab = "clinic" | "rates";

export function SettingsTabs({
  clinic,
  rateCards,
}: {
  clinic: Clinic;
  rateCards: RateCard[];
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
      </div>

      <div className="mt-6">
        {tab === "clinic" ? (
          <ClinicInfoForm clinic={clinic} />
        ) : (
          <RateCardManager rateCards={rateCards} />
        )}
      </div>
    </div>
  );
}
