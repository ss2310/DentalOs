import { PageHeader } from "@/components/page";
import { ResultClient } from "./result-client";

export const dynamic = "force-dynamic";

// Landing page after Cashfree hosted checkout returns. Display-only: it reflects
// our pending_payments status (updated by the webhook), and never fulfills the
// order itself — the return redirect is untrusted.
export default function UpgradeResultPage({
  searchParams,
}: {
  searchParams: { order_id?: string };
}) {
  const orderId = searchParams.order_id ?? null;

  return (
    <div>
      <PageHeader
        title="Payment"
        subtitle="We're confirming your payment with the gateway."
      />
      <ResultClient orderId={orderId} />
    </div>
  );
}
