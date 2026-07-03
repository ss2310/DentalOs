import { createClient } from "@/lib/supabase/server";

// Public, no-login hosted landing page: GET /p/<clinic booking_slug>/<page slug>.
// Served as a full standalone HTML document (its own <title>/meta live inside
// html_content) — NOT wrapped in the app shell. Anonymous read goes through the
// SECURITY DEFINER get_published_landing_page() RPC (migration 007), which only
// returns rows with status = 'published'. This route is allow-listed as public
// in lib/supabase/middleware.ts.
//
// Subdomain-hosted v1: the clinic's booking_slug is the public prefix. Mapping a
// clinic's own custom domain to these pages is a future feature — not built here.

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found</title><style>body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0F172A;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px}</style></head><body><div><h1>Page not found</h1><p>This page may have been unpublished or moved.</p></div></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: { bookingSlug: string; pageSlug: string } },
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .rpc("get_published_landing_page", {
      p_booking_slug: params.bookingSlug,
      p_slug: params.pageSlug,
    })
    .maybeSingle();

  if (error) {
    console.error("Landing page lookup failed:", error);
    return notFound();
  }

  const html = (data as { html_content?: string | null } | null)?.html_content;
  if (!html) return notFound();

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Short CDN cache; unpublish/edit takes effect within the minute.
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}
