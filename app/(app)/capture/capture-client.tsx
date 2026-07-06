"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/toast";
import { waLink } from "@/lib/whatsapp";
import {
  captureReviewMessage,
  REVIEW_ASK_COOLDOWN_DAYS,
} from "@/lib/capture/consent";
import { WhatsAppIcon } from "@/components/icons";
import { saveMoment, markCaptureReviewSent, type CaptureState } from "./actions";

type Patient = { id: string; name: string; phone: string };

// Chairside capture: 3 quick steps + the review ask. Every consent decision is
// re-validated server-side — this UI is convenience, not the gate.
export function CaptureClient({
  patients,
  treatments,
  reviewUrl,
}: {
  patients: Patient[];
  treatments: string[];
  reviewUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [treatment, setTreatment] = useState("");
  const [consentReview, setConsentReview] = useState(false);
  const [consentSocial, setConsentSocial] = useState(false);
  const [saved, setSaved] = useState<CaptureState | null>(null);
  const [reviewSent, setReviewSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 5);
    return patients
      .filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q))
      .slice(0, 5);
  }, [patients, query]);

  const selectedPatient = patients.find((p) => p.id === patientId) ?? null;
  const patientName = selectedPatient?.name ?? newName;
  const patientPhone = selectedPatient?.phone ?? newPhone;

  const pick = (file: File | null, slot: "after" | "before") => {
    const url = file ? URL.createObjectURL(file) : null;
    if (slot === "after") {
      setAfterFile(file);
      setAfterPreview(url);
    } else {
      setBeforeFile(file);
      setBeforePreview(url);
    }
  };

  const save = () => {
    if (!afterFile) return toast("Snap the result photo first.");
    if (!patientId && (!newName.trim() || !newPhone.trim()))
      return toast("Pick a patient or add name + mobile number.");
    if (!consentReview && !consentSocial)
      return toast("At least one consent is needed to save anything.");

    const fd = new FormData();
    fd.set("after_photo", afterFile);
    if (beforeFile) fd.set("before_photo", beforeFile);
    fd.set("patient_id", patientId);
    fd.set("new_patient_name", newName);
    fd.set("new_patient_phone", newPhone);
    fd.set("treatment", treatment);
    fd.set("consent_review", String(consentReview));
    fd.set("consent_social", String(consentSocial));

    startTransition(async () => {
      const res = await saveMoment(fd);
      if (res.error) return toast(res.error);
      setSaved(res);
      toast("Moment saved ✓");
    });
  };

  const sendReviewAsk = () => {
    if (!saved?.momentId || !reviewUrl) return;
    // Open wa.me synchronously in the tap; the photo NEVER rides along —
    // the message builder takes text inputs only.
    window.open(
      waLink(patientPhone, captureReviewMessage(patientName, reviewUrl)),
      "_blank",
      "noopener,noreferrer",
    );
    startTransition(async () => {
      const res = await markCaptureReviewSent(saved.momentId!);
      if (res.error) toast(res.error);
      else {
        setReviewSent(true);
        toast("Review request sent ✓");
      }
    });
  };

  const toggleClass = (on: boolean) =>
    `flex min-h-[56px] w-full items-start gap-3 rounded-card border p-4 text-left transition-colors ${
      on ? "border-primary bg-primary/5" : "border-border bg-white"
    }`;

  // ---- saved: the review-ask / done screen ----
  if (saved?.ok) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-card border border-success/30 bg-success/5 p-5 text-center">
          <p className="text-[17px] font-semibold text-success">Moment saved ✓</p>
          <p className="mt-1 text-sm text-text-secondary">
            {consentSocial
              ? "Consent covers social — you can compose a post from the Gallery."
              : "Stored privately — review use only."}
          </p>
        </div>

        {consentReview ? (
          reviewSent ? (
            <p className="flex h-12 items-center justify-center text-[15px] font-medium text-success">
              ✓ Review request sent
            </p>
          ) : !reviewUrl ? (
            <p className="rounded-card border border-warning/30 bg-warning/5 p-4 text-sm">
              Add your Google review link in{" "}
              <Link href="/settings" className="font-medium text-primary">
                Settings
              </Link>{" "}
              to send review requests.
            </p>
          ) : saved.reviewAsk?.allowed ? (
            <button
              onClick={sendReviewAsk}
              disabled={pending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
            >
              <WhatsAppIcon width={18} height={18} />
              Send review request on WhatsApp
            </button>
          ) : (
            <p className="rounded-card border border-border bg-subtle p-4 text-center text-sm text-text-secondary">
              Already asked {saved.reviewAsk?.daysAgo} day(s) ago — one request per{" "}
              {REVIEW_ASK_COOLDOWN_DAYS} days per patient.
            </p>
          )
        ) : null}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setSaved(null);
              setReviewSent(false);
              setAfterFile(null);
              setBeforeFile(null);
              setAfterPreview(null);
              setBeforePreview(null);
              setPatientId("");
              setNewName("");
              setNewPhone("");
              setTreatment("");
              setConsentReview(false);
              setConsentSocial(false);
            }}
            className="flex h-12 flex-1 items-center justify-center rounded-button border border-border bg-white text-[15px] font-medium"
          >
            Capture another
          </button>
          <Link
            href="/capture/gallery"
            className="flex h-12 flex-1 items-center justify-center rounded-button border border-border bg-white text-[15px] font-medium"
          >
            Open gallery
          </Link>
        </div>
      </div>
    );
  }

  // ---- the 3-step form ----
  return (
    <form ref={formRef} className="mt-6 space-y-7" onSubmit={(e) => e.preventDefault()}>
      {/* 1 · Snap */}
      <div>
        <p className="text-[17px] font-semibold">1 · The result photo</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-card border border-dashed border-border bg-white text-center">
            {afterPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={afterPreview} alt="After" className="h-full w-full object-cover" />
            ) : (
              <span className="p-3 text-sm text-text-secondary">
                📸 After
                <br />
                (required)
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null, "after")}
            />
          </label>
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-card border border-dashed border-border bg-white text-center">
            {beforePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={beforePreview} alt="Before" className="h-full w-full object-cover" />
            ) : (
              <span className="p-3 text-sm text-text-secondary">
                Before
                <br />
                (optional)
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null, "before")}
            />
          </label>
        </div>
      </div>

      {/* 2 · Who */}
      <div>
        <p className="text-[17px] font-semibold">2 · Whose smile is it?</p>
        {!patientId ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients by name or number"
              className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
            />
            {matches.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPatientId(p.id)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-button border border-border bg-white px-4 text-left text-[15px] hover:border-primary/40"
                  >
                    <span>{p.name}</span>
                    <span className="text-sm text-text-secondary">{p.phone}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-sm text-text-secondary">Or add them quickly:</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                className="h-12 rounded-button border border-border px-4 text-[15px] focus:outline-none"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Mobile (+91…)"
                inputMode="tel"
                className="h-12 rounded-button border border-border px-4 text-[15px] focus:outline-none"
              />
            </div>
          </>
        ) : (
          <div className="mt-3 flex items-center justify-between rounded-card border border-primary bg-primary/5 p-4">
            <div>
              <p className="text-[15px] font-medium">{selectedPatient?.name}</p>
              <p className="text-sm text-text-secondary">{selectedPatient?.phone}</p>
            </div>
            <button
              type="button"
              onClick={() => setPatientId("")}
              className="min-h-[44px] text-sm font-medium text-primary"
            >
              Change
            </button>
          </div>
        )}
        <div className="mt-4">
          <p className="text-sm font-medium text-text-primary">Treatment</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {treatments.slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTreatment(t)}
                className={`flex min-h-[44px] items-center rounded-pill border px-4 text-sm ${
                  treatment === t
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
            placeholder="Or type the treatment"
            className="mt-2 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
          />
        </div>
      </div>

      {/* 3 · Consent — the DPDP record. Two SEPARATE, explicit toggles. */}
      <div>
        <p className="text-[17px] font-semibold">3 · Patient&apos;s consent</p>
        <p className="mt-1 text-sm text-text-secondary">
          Ask the patient and tick only what they agree to. Nothing saves without
          at least one.
        </p>
        <div className="mt-3 space-y-2">
          <button type="button" onClick={() => setConsentReview((v) => !v)} className={toggleClass(consentReview)}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${consentReview ? "border-primary bg-primary text-white" : "border-border bg-white text-transparent"}`}>
              ✓
            </span>
            <span>
              <span className="block text-[15px] font-medium">
                A · Review request par WhatsApp bhejna theek hai
              </span>
              <span className="block text-sm text-text-secondary">
                We may send them ONE review request (no photo ever attached).
              </span>
            </span>
          </button>
          <button type="button" onClick={() => setConsentSocial((v) => !v)} className={toggleClass(consentSocial)}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${consentSocial ? "border-primary bg-primary text-white" : "border-border bg-white text-transparent"}`}>
              ✓
            </span>
            <span>
              <span className="block text-[15px] font-medium">
                B · Photo social media par share karna theek hai
              </span>
              <span className="block text-sm text-text-secondary">
                The clinic may post this photo, always labelled &quot;Actual patient —
                shared with consent&quot;.
              </span>
            </span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save moment"}
      </button>
    </form>
  );
}
