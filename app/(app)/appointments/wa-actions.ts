import { formatTime } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import type { AppointmentRow } from "@/lib/types";

export type WaActionKind =
  | "24h"
  | "1h"
  | "recover_noshow"
  | "recover_cancelled"
  | "review";

// One WhatsApp action slot on a card: either an actionable button (with a
// prebuilt wa.me url) or a "sent" state (renders the ✓ Sent label).
export type WaAction = {
  kind: WaActionKind;
  label: string;
  state: "available" | "sent";
  url?: string;
};

type ClinicInfo = {
  phone: string | null;
  google_review_url: string | null;
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Computes the WhatsApp action slots for one appointment, given IST "now"
 * and tomorrow's date string. Message copy and visibility follow the spec;
 * the anti-duplicate pattern means a button becomes a "sent" slot once its
 * timestamp/flag is set.
 */
export function buildWaActions(
  a: AppointmentRow,
  clinic: ClinicInfo,
  now: { date: string; time: string },
  tomorrow: string,
): WaAction[] {
  const out: WaAction[] = [];
  const name = a.patient?.full_name ?? "there";
  const number = a.patient?.whatsapp_number ?? "";
  const time = formatTime(a.appointment_time);
  const clinicPhone = clinic.phone ? `+91 ${clinic.phone}` : "";

  const activeStatus = a.status === "scheduled" || a.status === "confirmed";
  const isTomorrow = a.appointment_date === tomorrow;
  const isToday = a.appointment_date === now.date;
  const apptMin = toMinutes(a.appointment_time);
  const nowMin = toMinutes(now.time);
  const within90 = isToday && apptMin >= nowMin && apptMin <= nowMin + 90;

  // 1. 24h reminder — the day before, still active.
  if (activeStatus && isTomorrow) {
    if (a.reminder_24h_sent_at) {
      out.push({ kind: "24h", label: "Send 24h Reminder", state: "sent" });
    } else if (number) {
      out.push({
        kind: "24h",
        label: "Send 24h Reminder",
        state: "available",
        url: waLink(
          number,
          `Namaste ${name} ji, kal aapka appointment ${time} baje scheduled hai. Please 10 min pehle pahunchein. 🙏`,
        ),
      });
    }
  }

  // 2. 1h reminder — today, within the next 90 minutes, still active.
  if (activeStatus && within90) {
    if (a.reminder_1h_sent_at) {
      out.push({ kind: "1h", label: "Send 1h Reminder", state: "sent" });
    } else if (number) {
      out.push({
        kind: "1h",
        label: "Send 1h Reminder",
        state: "available",
        url: waLink(
          number,
          `Hi ${name} ji, bas 1 ghante mein aapka appointment hai. Hum aapka wait kar rahe hain! 🦷`,
        ),
      });
    }
  }

  // 3. Recover no-show.
  if (a.status === "no_show" && !a.recovery_sent_at && number) {
    out.push({
      kind: "recover_noshow",
      label: "Recover No-Show",
      state: "available",
      url: waLink(
        number,
        `Hi ${name} ji,\nHumein pata chala ki aap apne appointment par nahi aa paye. Hum samajhte hain ki plans change ho jaate hain. 🙂\n\nJab bhi suitable time mile, hume WhatsApp par bata dijiye!\n📞 ${clinicPhone}`,
      ),
    });
  }

  // 4. Recover cancelled.
  if (a.status === "cancelled_patient" && !a.recovery_sent_at && number) {
    out.push({
      kind: "recover_cancelled",
      label: "Recover Cancelled",
      state: "available",
      url: waLink(
        number,
        `Hi ${name} ji, aapka appointment cancel hua tha. Jab bhi reschedule karna ho, hume batayein. 🙏`,
      ),
    });
  }

  // Recovery already sent (either path sets status=recovery_sent).
  if (a.status === "recovery_sent" && a.recovery_sent_at) {
    out.push({ kind: "recover_noshow", label: "Recovery", state: "sent" });
  }

  // Review requests are handled entirely on the dedicated /reviews page, not on
  // appointment cards (kept off here to reduce clutter).

  return out;
}
