import { requireAdminContext } from "@/lib/admin/auth";
import { formatDate } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { trialDaysLeft } from "@/lib/subscription";
import {
  trialEndingMessage,
  trialEndedMessage,
  deactivatedMessage,
} from "@/lib/subscription-messages";
import { PendingList, type PendingRow } from "./pending-list";

export const dynamic = "force-dynamic";

type RawPending = {
  id: string;
  created_at: string;
  event_type: string;
  amount_inr: number | string | null;
  plan_id: string | null;
  credit_pack_id: string | null;
  clinics: { business_name: string | null } | null;
  plans: { name: string | null } | null;
  credit_packs: { name: string | null } | null;
};

type ClinicRow = {
  id: string;
  business_name: string | null;
  doctor_name: string | null;
  phone: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  past_due_since: string | null;
  deactivated_at: string | null;
};

type FollowUp = {
  id: string;
  clinicName: string;
  phone: string | null;
  stageLabel: string;
  detail: string;
  waHref: string | null;
  order: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminSubscriptionsPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for these cross-tenant reads.
  const { db } = await requireAdminContext();

  const [{ data: pendingData }, { data: clinicData }] = await Promise.all([
    db
      .from("billing_events")
      .select(
        "id, created_at, event_type, amount_inr, plan_id, credit_pack_id, clinics(business_name), plans(name), credit_packs(name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    db
      .from("clinics")
      .select(
        "id, business_name, doctor_name, phone, subscription_status, trial_ends_at, past_due_since, deactivated_at",
      )
      .in("subscription_status", ["trial", "past_due", "deactivated"]),
  ]);

  const pending: PendingRow[] = ((pendingData as RawPending[] | null) ?? []).map(
    (r) => ({
      id: r.id,
      created_at: r.created_at,
      kind: r.plan_id ? "Plan" : "Top-up",
      itemName: r.plan_id
        ? (r.plans?.name ?? "Plan")
        : (r.credit_packs?.name ?? "Top-up"),
      clinicName: r.clinics?.business_name ?? "Unknown clinic",
      amount: r.amount_inr,
    }),
  );

  // Build the dunning follow-up list: trials ending within 7 days, all past_due,
  // and clinics deactivated in the last 7 days. Each gets a one-tap wa.me link
  // to the owner (their mobile is clinics.phone) with the stage's Hinglish copy.
  const now = Date.now();
  const followUps: FollowUp[] = [];
  for (const c of (clinicData as ClinicRow[] | null) ?? []) {
    const clinicName = c.business_name ?? "Unnamed clinic";
    if (c.subscription_status === "trial") {
      const days = trialDaysLeft(c.trial_ends_at);
      if (days > 7) continue;
      followUps.push({
        id: c.id,
        clinicName,
        phone: c.phone,
        stageLabel: "Trial ending",
        detail: days <= 0 ? "ends today" : `${days} day${days === 1 ? "" : "s"} left`,
        waHref: c.phone
          ? waLink(c.phone, trialEndingMessage(days, c.doctor_name))
          : null,
        order: days,
      });
    } else if (c.subscription_status === "past_due") {
      followUps.push({
        id: c.id,
        clinicName,
        phone: c.phone,
        stageLabel: "Trial ended",
        detail: c.past_due_since
          ? `past due since ${formatDate(c.past_due_since)}`
          : "past due",
        waHref: c.phone
          ? waLink(c.phone, trialEndedMessage(c.doctor_name))
          : null,
        order: 100,
      });
    } else if (c.subscription_status === "deactivated") {
      if (!c.deactivated_at) continue;
      if (now - new Date(c.deactivated_at).getTime() > 7 * DAY_MS) continue;
      followUps.push({
        id: c.id,
        clinicName,
        phone: c.phone,
        stageLabel: "Deactivated",
        detail: `on ${formatDate(c.deactivated_at)}`,
        waHref: c.phone
          ? waLink(c.phone, deactivatedMessage(c.doctor_name))
          : null,
        order: 200,
      });
    }
  }
  followUps.sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
            Subscriptions
          </h1>
          <span className="text-sm text-text-secondary">
            {pending.length} pending · {followUps.length} to follow up
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
          Confirm manual payments and follow up with clinics whose trial is
          ending or has lapsed. Setting plan/pack prices and full per-clinic
          management land in a later step (A2).
        </p>
      </div>

      {/* Dunning follow-ups — one-tap WhatsApp to the owner */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Trial &amp; dunning follow-ups
        </h2>
        {followUps.length === 0 ? (
          <div className="mt-4 rounded-card border border-border bg-white p-8 text-center shadow-card">
            <p className="text-[15px] text-text-secondary">
              No clinics need a follow-up right now.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-card border border-border bg-white shadow-card">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 font-medium">Clinic</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                  <th className="px-4 py-3 text-right font-medium">Reach out</th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-0 hover:bg-subtle"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {f.clinicName}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {f.stageLabel}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{f.detail}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {f.waHref ? (
                          <a
                            href={f.waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-9 items-center rounded-button bg-success px-3 text-sm font-medium text-white hover:bg-success/90"
                          >
                            WhatsApp owner
                          </a>
                        ) : (
                          <span className="text-sm text-text-secondary">
                            No phone
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending manual payments */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Pending payments
        </h2>
        <PendingList rows={pending} />
      </div>
    </div>
  );
}
