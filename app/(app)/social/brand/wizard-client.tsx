"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { saveVoiceProfile, saveBrandKit, type VoiceProfileInput } from "../actions";

// 6 questions across 3 screens (chips + free text), plus the brand kit card.
// Skip = safe defaults: the engine builds a default personality from the clinic
// record at first generation, so skipping never leaves generation voiceless.

type Clinic = { name: string; doctor: string; area: string; city: string; phone: string };
type Kit = { primary_color: string; secondary_color: string; font: string; hasLogo: boolean };

const LANG_OPTIONS = [
  { value: "hinglish", label: "Hinglish" },
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
];

export function BrandWizardClient({
  initial,
  clinic,
  hasProfile,
  kit,
}: {
  initial: VoiceProfileInput;
  clinic: Clinic;
  hasProfile: boolean;
  kit: Kit;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState(0);
  const [form, setForm] = useState<VoiceProfileInput>(initial);
  const [bannedInput, setBannedInput] = useState("");
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof VoiceProfileInput>(k: K, v: VoiceProfileInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const identityChips = [
    [clinic.name, clinic.doctor ? `led by Dr. ${clinic.doctor}` : "", clinic.area ? `in ${clinic.area}, ${clinic.city}` : ""]
      .filter(Boolean)
      .join(", "),
    `${clinic.name} — your family clinic in ${clinic.area || clinic.city}`,
    `${clinic.name}, modern care with a personal touch`,
  ].filter((s) => s.trim().length > 5);

  const audienceChips = [
    "Local families and parents",
    "Working professionals nearby",
    "Students and young adults",
  ];

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] items-center rounded-pill border px-4 text-left text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-white hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );

  const next = () => {
    // One polite pushback on a vague identity (kept from the spec even after
    // the wizard was compressed to 3 screens).
    if (screen === 0 && form.identity_line.trim().length < 15) {
      toast("A little more detail helps — who are you, and where? One line is enough.");
      return;
    }
    setScreen((s) => s + 1);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveVoiceProfile(form);
      if (res.error) toast(res.error);
      else {
        toast("Brand Personality saved — new posts will use it.");
        router.push("/social");
        router.refresh();
      }
    });

  const skip = () => {
    toast("No problem — we'll write with safe defaults from your clinic profile.");
    router.push("/social");
  };

  const dots = (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === screen ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
        />
      ))}
    </div>
  );

  return (
    <div className="mt-6 space-y-6">
      {dots}

      {screen === 0 ? (
        <div className="space-y-7">
          <div>
            <p className="text-[17px] font-semibold">1 · Describe your clinic in one line</p>
            <input
              value={form.identity_line}
              onChange={(e) => set("identity_line", e.target.value)}
              placeholder="Who you are, where you are"
              className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
            />
            <div className="mt-2 flex flex-col gap-2">
              {identityChips.map((c) => chip(c, form.identity_line === c, () => set("identity_line", c)))}
            </div>
          </div>
          <div>
            <p className="text-[17px] font-semibold">2 · Who are your posts mainly for?</p>
            <input
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="Your typical patients"
              className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {audienceChips.map((c) => chip(c, form.audience === c, () => set("audience", c)))}
            </div>
          </div>
        </div>
      ) : null}

      {screen === 1 ? (
        <div className="space-y-7">
          <div>
            <p className="text-[17px] font-semibold">3 · How should you sound?</p>
            <div className="mt-4 space-y-5">
              <Slider
                label="Formal ↔ Friendly"
                value={form.tone_friendly}
                onChange={(v) => set("tone_friendly", v)}
              />
              <Slider
                label="Clinical ↔ Conversational"
                value={form.tone_conversational}
                onChange={(v) => set("tone_conversational", v)}
              />
            </div>
          </div>
          <div>
            <p className="text-[17px] font-semibold">4 · Language per platform</p>
            {(["instagram", "facebook", "gbp"] as const).map((p) => (
              <div key={p} className="mt-3">
                <p className="text-sm font-medium capitalize text-text-secondary">
                  {p === "gbp" ? "Google Business" : p}
                </p>
                <div className="mt-1.5 flex gap-2">
                  {LANG_OPTIONS.map((o) =>
                    chip(o.label, form.language_mix[p] === o.value, () =>
                      set("language_mix", { ...form.language_mix, [p]: o.value }),
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {screen === 2 ? (
        <div className="space-y-7">
          <div>
            <p className="text-[17px] font-semibold">
              5 · Facts you&apos;re proud of{" "}
              <span className="text-sm font-normal text-text-secondary">(each needs a source to be used)</span>
            </p>
            {[0, 1, 2].map((i) => {
              const pp = form.proof_points[i] ?? { claim: "", source: "" };
              const update = (field: "claim" | "source", val: string) => {
                const list = [...form.proof_points];
                while (list.length <= i) list.push({ claim: "", source: "" });
                list[i] = { ...list[i], [field]: val };
                set("proof_points", list);
              };
              return (
                <div key={i} className="mt-3 space-y-2 rounded-card border border-border bg-white p-3">
                  <input
                    value={pp.claim}
                    onChange={(e) => update("claim", e.target.value)}
                    placeholder={`Claim ${i + 1} — e.g. "4.9★ on Google"`}
                    className="h-11 w-full rounded-button border border-border px-3 text-[15px] focus:outline-none"
                  />
                  <input
                    value={pp.source}
                    onChange={(e) => update("source", e.target.value)}
                    placeholder="Where it's from — e.g. Google Business Profile"
                    className="h-11 w-full rounded-button border border-border px-3 text-[15px] focus:outline-none"
                  />
                  {pp.claim && !pp.source ? (
                    <p className="text-xs text-warning">
                      No source yet — this stays unverified and won&apos;t be used in posts.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div>
            <p className="text-[17px] font-semibold">6 · How should patients reach you?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["whatsapp", `WhatsApp${clinic.phone ? ` (${clinic.phone})` : ""}`],
                  ["call", "Phone call"],
                  ["walkin", "Walk in"],
                ] as const
              ).map(([v, label]) =>
                chip(label, form.cta_preference === v, () => set("cta_preference", v)),
              )}
            </div>
            <p className="mt-1.5 text-xs text-text-secondary">
              The number always comes from your clinic profile — update it in Settings.
            </p>
            <div className="mt-5">
              <p className="text-sm font-medium">Words you never want in your posts</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={bannedInput}
                  onChange={(e) => setBannedInput(e.target.value)}
                  placeholder='e.g. "cheapest"'
                  className="h-11 flex-1 rounded-button border border-border px-3 text-[15px] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const w = bannedInput.trim();
                    if (w && !form.banned_phrases.includes(w)) {
                      set("banned_phrases", [...form.banned_phrases, w]);
                    }
                    setBannedInput("");
                  }}
                  className="flex h-11 items-center rounded-button border border-border bg-white px-4 text-sm font-medium"
                >
                  Add
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.banned_phrases.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() =>
                      set("banned_phrases", form.banned_phrases.filter((x) => x !== b))
                    }
                    className="flex min-h-[36px] items-center gap-1 rounded-pill bg-subtle px-3 text-sm"
                  >
                    {b} <span className="text-text-secondary">×</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        {screen > 0 ? (
          <button
            onClick={() => setScreen((s) => s - 1)}
            className="flex h-12 items-center rounded-button border border-border bg-white px-5 text-[15px] font-medium"
          >
            Back
          </button>
        ) : null}
        {screen < 2 ? (
          <button
            onClick={next}
            className="flex h-12 flex-1 items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white"
          >
            Next
          </button>
        ) : (
          <button
            onClick={save}
            disabled={pending}
            className="flex h-12 flex-1 items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : hasProfile ? "Save new version" : "Save Brand Personality"}
          </button>
        )}
      </div>
      {!hasProfile ? (
        <button onClick={skip} className="mx-auto block min-h-[44px] text-sm text-text-secondary underline">
          Skip for now — use safe defaults
        </button>
      ) : null}

      {/* ---- Brand kit (renderer inputs) ---- */}
      <div className="mt-4 rounded-card border border-border bg-white p-4 shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Brand kit — for your post images
        </p>
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await saveBrandKit(fd);
              toast(res.error ?? "Brand kit saved.");
              if (!res.error) router.refresh();
            })
          }
          className="mt-3 space-y-4"
        >
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              Primary colour
              <input
                type="color"
                name="primary_color"
                defaultValue={kit.primary_color}
                className="mt-1 block h-11 w-16 cursor-pointer rounded-button border border-border"
              />
            </label>
            <label className="text-sm">
              Text colour
              <input
                type="color"
                name="secondary_color"
                defaultValue={kit.secondary_color}
                className="mt-1 block h-11 w-16 cursor-pointer rounded-button border border-border"
              />
            </label>
            <label className="text-sm">
              Font
              <select
                name="font"
                defaultValue={kit.font}
                className="mt-1 block h-11 rounded-button border border-border bg-white px-3 text-[15px]"
              >
                <option value="inter">Inter (clean)</option>
                <option value="poppins">Poppins (rounded)</option>
                <option value="lora">Lora (serif)</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Logo {kit.hasLogo ? <span className="text-success">(uploaded ✓ — choose a file to replace)</span> : "(PNG/JPG, under 2 MB)"}
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-button file:border-0 file:bg-subtle file:px-4 file:text-sm file:font-medium"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="flex h-11 items-center rounded-button border border-border bg-white px-5 text-[15px] font-medium disabled:opacity-60"
          >
            Save brand kit
          </button>
        </form>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [lo, hi] = label.split(" ↔ ");
  return (
    <div>
      <div className="flex justify-between text-sm text-text-secondary">
        <span className={value <= 40 ? "font-semibold text-text-primary" : ""}>{lo}</span>
        <span className={value >= 60 ? "font-semibold text-text-primary" : ""}>{hi}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full accent-primary"
      />
    </div>
  );
}
