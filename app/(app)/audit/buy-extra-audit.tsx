"use client";

import { useState, useTransition } from "react";
import { load } from "@cashfreepayments/cashfree-js";
import { toast } from "@/components/toast";
import { startCheckout } from "../upgrade/actions";

// Inline ₹599 "extra audit" purchase for the Deep Audit page — same Cashfree
// pack-checkout path the /upgrade page uses, so the top-up lives in both places.
// On success the tab redirects to Cashfree and returns to /upgrade/result, which
// credits the clinic (+1 deep_audit_credit via apply_pack_purchase).
export function BuyExtraAudit({ packId }: { packId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (!packId) return null;

  function buy() {
    setBusy(true);
    startTransition(async () => {
      const res = await startCheckout("pack", packId!);
      if (res.error) {
        setBusy(false);
        toast(res.error);
        return;
      }
      if (res.sessionId) {
        try {
          const cashfree = await load({ mode: res.mode ?? "sandbox" });
          const result = await cashfree.checkout({
            paymentSessionId: res.sessionId,
            redirectTarget: "_self",
          });
          if (result?.error) {
            setBusy(false);
            toast(result.error.message ?? "Payment could not be started.");
          }
        } catch {
          setBusy(false);
          toast("Could not open checkout. Please try again.");
        }
        return;
      }
      setBusy(false);
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      if (res.message) toast("Order placed ✓");
    });
  }

  return (
    <button
      type="button"
      disabled={pending && busy}
      onClick={buy}
      className="flex h-11 items-center justify-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
    >
      {pending && busy ? "Starting…" : "Buy an extra audit — ₹599"}
    </button>
  );
}
