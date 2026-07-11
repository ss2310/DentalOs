"use client";

import Link from "next/link";
import { WhatsAppIcon } from "@/components/icons";
import { waLink } from "@/lib/whatsapp";
import { formatDate, formatINR } from "@/lib/format";

// Per-payment actions: open the printable receipt, or WhatsApp it to the
// patient (wa.me only — CLAUDE.md rule 3). Used on the Daysheet and the
// patient profile's Payments tab.

const btnBase =
  "flex h-11 items-center justify-center gap-1.5 rounded-button px-3 text-sm font-medium";

export function ReceiptActions({
  paymentId,
  receiptNo,
  amount,
  paymentDate,
  patientName,
  patientWhatsapp,
  clinicName,
}: {
  paymentId: string;
  receiptNo: string | null;
  amount: number;
  paymentDate: string;
  patientName: string;
  patientWhatsapp: string | null;
  clinicName: string;
}) {
  const message =
    `🧾 *Payment Receipt${receiptNo ? ` ${receiptNo}` : ""}*\n` +
    `${patientName}\n` +
    `Amount received: *${formatINR(amount)}*\n` +
    `Date: ${formatDate(paymentDate)}\n\n` +
    `Thank you 🙏\n${clinicName}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/receipt/${paymentId}`}
        target="_blank"
        className={`${btnBase} border border-border text-text-primary hover:bg-subtle`}
      >
        Print
      </Link>
      {patientWhatsapp ? (
        <a
          href={waLink(patientWhatsapp, message)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnBase} border border-success/30 bg-success/5 text-success hover:bg-success/10`}
        >
          <WhatsAppIcon width={16} height={16} />
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}
