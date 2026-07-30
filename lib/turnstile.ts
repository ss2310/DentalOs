import "server-only";

// Cloudflare Turnstile server-side verification (SEC: anti-bot signup).
//
// Key-gated: when TURNSTILE_SECRET_KEY isn't set the check passes, so the
// feature turns on simply by adding NEXT_PUBLIC_TURNSTILE_SITE_KEY (client
// widget, build-inlined — redeploy without cache after setting it) and
// TURNSTILE_SECRET_KEY (this check) to the environment.
//
// Fail-open on transport errors: a Cloudflare outage must not brick signup.
// The emailed verification code remains the hard gate either way.

export async function verifyTurnstileToken(
  token: string | null,
  ip: string | null,
): Promise<{ ok: boolean; reason?: "missing" | "rejected" }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: "missing" };

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip && ip !== "unknown" ? { remoteip: ip } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data?.success ? { ok: true } : { ok: false, reason: "rejected" };
  } catch (err) {
    console.error("Turnstile siteverify failed (allowing):", err);
    return { ok: true };
  }
}
