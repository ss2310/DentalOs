"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import type { PatientOption, RateCardOption } from "@/lib/types";
import type { RecallStatus } from "@/lib/recall-status";
import { BookAppointment } from "@/app/(app)/appointments/book-appointment";
import {
  remindRecall,
  markRecallScheduled,
  completeRecall,
  dismissRecall,
  type RecallActionState,
} from "./actions";

export type RecallView = {
  id: string;
  patientId: string;
  patientName: string;
  patientWhatsapp: string | null;
  status: RecallStatus;
  remindUrl: string | null;
};

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnSuccess = `${btnBase} bg-success text-white hover:bg-success/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

export function RecallActions({
  view,
  patients,
  rateCards,
  doctorName,
  today,
}: {
  view: RecallView;
  patients: PatientOption[];
  rateCards: RateCardOption[];
  doctorName: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bookOpen, setBookOpen] = useState(false);

  const { id, status } = view;
  const active = status === "pending" || status === "reminded";

  function run(fn: () => Promise<RecallActionState>, msg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      if (msg) toast(msg);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active && view.remindUrl ? (
        <button
          className={`${btnBase} gap-1.5 border border-success/30 bg-success/5 text-success hover:bg-success/10`}
          disabled={pending}
          onClick={() => {
            window.open(view.remindUrl!, "_blank", "noopener,noreferrer");
            run(() => remindRecall(id), "Reminder sent");
          }}
        >
          <WhatsAppIcon width={16} height={16} />
          Remind
        </button>
      ) : null}

      {active ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => setBookOpen(true)}
        >
          Book
        </button>
      ) : null}

      {status === "pending" ||
      status === "reminded" ||
      status === "scheduled" ? (
        <button
          className={btnSuccess}
          disabled={pending}
          onClick={() => run(() => completeRecall(id), "Recall completed")}
        >
          Complete
        </button>
      ) : null}

      {active ? (
        <button
          className={btnOutline}
          disabled={pending}
          onClick={() => {
            if (window.confirm("Dismiss this recall?")) {
              run(() => dismissRecall(id), "Recall dismissed");
            }
          }}
        >
          Dismiss
        </button>
      ) : null}

      <BookAppointment
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        patients={patients}
        rateCards={rateCards}
        defaultDate={today}
        defaultDoctor={doctorName}
        initialPatient={{
          id: view.patientId,
          full_name: view.patientName,
          whatsapp_number: view.patientWhatsapp,
          phone: null,
        }}
        onBooked={async () => {
          await markRecallScheduled(id);
        }}
      />
    </div>
  );
}
