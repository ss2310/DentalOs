// UPI payment-link helpers. The clinic stores its own VPA (clinics.upi_id) and
// we build a wa.me message containing a upi://pay deep link that opens the
// patient's UPI app with the amount prefilled. Confirmation stays MANUAL — the
// receptionist records the payment when the screenshot arrives (no webhook).
//
// Client-safe: pure string helpers, no server-only imports. Used server-side on
// /billing and client-side in the treatment-plan presenter.

/** Loose VPA check: "something@something" with no spaces. */
export function isValidUpiId(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value.trim());
}

/**
 * The exact Hinglish UPI-request message, BEFORE waLink's url-encoding. The
 * payee name inside the upi:// link is url-encoded here so spaces/specials in
 * the clinic name don't break the deep link once WhatsApp decodes the message.
 */
export function upiMessage(opts: {
  name: string;
  amount: number | string;
  upiId: string;
  clinicName: string;
}): string {
  const pn = encodeURIComponent(opts.clinicName || "Clinic");
  const am = opts.amount;
  return (
    `Namaste ${opts.name} ji, aap apna ₹${am} balance UPI se pay kar sakte hain:\n\n` +
    `📱 UPI ID: ${opts.upiId}\n\n` +
    `Ya is link par tap karein:\n` +
    `upi://pay?pa=${opts.upiId}&pn=${pn}&am=${am}&cu=INR&tn=DentalBill\n\n` +
    `Payment ke baad screenshot bhej dein 🙏`
  );
}
