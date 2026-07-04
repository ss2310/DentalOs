"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import { waLink } from "@/lib/whatsapp";
import { requestReview } from "../appointments/actions";
import { sendSurvey } from "./survey-actions";

// The public survey lives at {base}/s/{token}. Prefer the configured public URL
// (correct in the WhatsApp message the patient opens on their phone); fall back
// to the current origin in dev / when unset.
function surveyBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    window.location.origin
  );
}

function surveyMessage(name: string, url: string): string {
  return `Hi ${name} ji, aapka visit kaisa raha? 30 second mein batayein: 🙏\n${url}`;
}

function reviewMessage(name: string, url: string): string {
  return `Hi ${name} ji, aapka visit accha raha 😊\nAgar experience accha laga, toh 30 seconds mein review dein:\n🔗 ${url}\nShukriya! 🙏`;
}

function SentLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-11 items-center rounded-button px-3 text-sm font-medium text-success">
      ✓ {children}
    </span>
  );
}

/**
 * Post-visit actions on a completed appointment. The satisfaction survey is the
 * primary action (teal); a direct Google review request stays available as a
 * secondary action. Both follow the anti-duplicate pattern: once sent, the
 * button becomes a "✓ Sent" label.
 */
export function PostVisitActions({
  appointmentId,
  patientName,
  patientNumber,
  reviewUrl,
  surveySent,
  reviewSent,
}: {
  appointmentId: string;
  patientName: string;
  patientNumber: string;
  reviewUrl: string;
  surveySent: boolean;
  reviewSent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSendSurvey() {
    // Mint the token client-side so the wa.me tab can open synchronously inside
    // the click (not blocked as a popup); persist the same token server-side.
    const token = crypto.randomUUID();
    const url = surveyMessage(
      patientName,
      `${surveyBase()}/s/${token}`,
    );
    window.open(waLink(patientNumber, url), "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const res = await sendSurvey(appointmentId, token);
      if (res?.error) {
        toast(res.error);
        return;
      }
      router.refresh();
    });
  }

  function onRequestReview() {
    window.open(
      waLink(patientNumber, reviewMessage(patientName, reviewUrl)),
      "_blank",
      "noopener,noreferrer",
    );
    startTransition(async () => {
      const res = await requestReview(appointmentId);
      if (res?.error) {
        toast(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary: satisfaction survey */}
      {surveySent ? (
        <SentLabel>Survey Sent</SentLabel>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={onSendSurvey}
          className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-3.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
        >
          <WhatsAppIcon width={16} height={16} />
          Send Survey
        </button>
      )}

      {/* Secondary: direct Google review request */}
      {reviewSent ? (
        <SentLabel>Review Sent</SentLabel>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={onRequestReview}
          className="flex h-11 items-center gap-1.5 rounded-button border border-border bg-white px-3.5 text-sm font-medium text-text-primary hover:bg-subtle disabled:opacity-60"
        >
          <WhatsAppIcon width={16} height={16} />
          Request Review
        </button>
      )}
    </div>
  );
}
