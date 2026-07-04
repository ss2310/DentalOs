"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import { waLink } from "@/lib/whatsapp";
import { markSurveyHandled } from "./survey-actions";

function followUpMessage(name: string): string {
  return `Hi ${name} ji, aapke recent visit ka feedback mila. Hum chahte hain ki aapka experience behtar ho — kya main aapse 2 minute baat kar sakta/sakti hoon? 🙏`;
}

/**
 * Row actions for a low-score (1–3) survey response: reach out on WhatsApp and
 * mark the complaint handled (closes its urgent notification). Once handled the
 * row shows a quiet "✓ Handled" label instead.
 */
export function SurveyRowActions({
  surveyId,
  patientName,
  patientNumber,
  handled,
}: {
  surveyId: string;
  patientName: string;
  patientNumber: string;
  handled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (handled) {
    return (
      <span className="inline-flex h-11 items-center rounded-button px-2 text-sm font-medium text-success">
        ✓ Handled
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {patientNumber ? (
        <button
          type="button"
          onClick={() =>
            window.open(
              waLink(patientNumber, followUpMessage(patientName)),
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="flex h-11 items-center gap-1.5 rounded-button border border-success/30 bg-success/5 px-3 text-sm font-medium text-success hover:bg-success/10"
        >
          <WhatsAppIcon width={16} height={16} />
          WhatsApp
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await markSurveyHandled(surveyId);
            if (res?.error) {
              toast(res.error);
              return;
            }
            router.refresh();
          })
        }
        className="flex h-11 items-center rounded-button bg-primary px-3.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
      >
        Mark Handled
      </button>
    </div>
  );
}
