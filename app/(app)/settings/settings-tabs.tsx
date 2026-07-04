"use client";

import { useState } from "react";
import { ClinicInfoForm, type Clinic } from "./clinic-info-form";
import { RateCardManager, type RateCard } from "./rate-card-manager";
import {
  LandingPagesManager,
  type LandingPageRow,
} from "./landing-pages-manager";
import { StaffManager, type StaffMember } from "./staff-manager";
import { DataMigration } from "./data-migration";
import { BillingTab, type BillingInfo } from "./billing-tab";
import { VoiceNotesSettings } from "./voice-notes-settings";
import { VerticalSelector } from "./vertical-selector";

export type VerticalSettingsInfo = {
  enabled: boolean;
  current: string;
  options: { id: string; display_name: string }[];
};

type Tab =
  | "clinic"
  | "rates"
  | "landing"
  | "staff"
  | "billing"
  | "migration"
  | "voice";

export type VoiceNotesSettingsInfo = {
  enabled: boolean;
  globalEnabled: boolean;
  dailyCap: number;
};

export function SettingsTabs({
  clinic,
  rateCards,
  landingPages,
  bookingSlug,
  staff,
  currentUserId,
  billing,
  voiceNotes,
  vertical,
}: {
  clinic: Clinic;
  rateCards: RateCard[];
  landingPages: LandingPageRow[];
  bookingSlug: string | null;
  staff: StaffMember[];
  currentUserId: string;
  billing: BillingInfo;
  voiceNotes: VoiceNotesSettingsInfo;
  vertical: VerticalSettingsInfo;
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
        <button type="button" className={tabClass("staff")} onClick={() => setTab("staff")}>
          Staff
        </button>
        <button type="button" className={tabClass("billing")} onClick={() => setTab("billing")}>
          Billing
        </button>
        <button type="button" className={tabClass("migration")} onClick={() => setTab("migration")}>
          Data Migration
        </button>
        <button type="button" className={tabClass("voice")} onClick={() => setTab("voice")}>
          Voice Notes
        </button>
      </div>

      <div className="mt-6">
        {tab === "clinic" ? (
          <>
            {vertical.enabled ? (
              <VerticalSelector
                current={vertical.current}
                options={vertical.options}
              />
            ) : null}
            <ClinicInfoForm clinic={clinic} />
          </>
        ) : tab === "rates" ? (
          <RateCardManager rateCards={rateCards} />
        ) : tab === "landing" ? (
          <LandingPagesManager pages={landingPages} bookingSlug={bookingSlug} />
        ) : tab === "staff" ? (
          <StaffManager staff={staff} currentUserId={currentUserId} />
        ) : tab === "billing" ? (
          <BillingTab info={billing} />
        ) : tab === "migration" ? (
          <DataMigration />
        ) : (
          <VoiceNotesSettings
            enabled={voiceNotes.enabled}
            globalEnabled={voiceNotes.globalEnabled}
            dailyCap={voiceNotes.dailyCap}
          />
        )}
      </div>
    </div>
  );
}
