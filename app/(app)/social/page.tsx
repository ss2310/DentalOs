import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { checkSocialQuota } from "@/lib/social/generate";
import { formatDate } from "@/lib/format";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { PostRow, StatusBadge, type SocialPostRow } from "./ui";

// Social Content Engine home — the queue. Calendar-lite: upcoming posts are
// grouped by week (the month grid is a fast follow). Server component; RLS
// scopes every read to the clinic.
export const dynamic = "force-dynamic";

function weekLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const startOfWeek = (x: Date) => {
    const c = new Date(x);
    c.setDate(c.getDate() - ((c.getDay() + 6) % 7)); // Monday
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const diff = Math.round(
    (startOfWeek(d).getTime() - startOfWeek(now).getTime()) / (7 * 86400000),
  );
  if (diff <= 0) return "This week";
  if (diff === 1) return "Next week";
  return `Week of ${formatDate(dateStr)}`;
}

export default async function SocialPage() {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");

  const supabase = createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, plan_id, content_credits_balance")
    .single();
  if (!clinic) redirect("/dashboard");

  const [{ data: posts }, quota, { data: voice }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(
        "id, platform, format, caption, status, topic, scheduled_date, ymyl_flags, posted_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(120),
    checkSocialQuota(supabase, clinic, 0),
    supabase
      .from("clinic_voice_profiles")
      .select("id, source")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const all = (posts ?? []) as SocialPostRow[];
  const pending = all.filter((p) => p.status === "pending_approval");
  const approved = all.filter((p) => p.status === "approved");
  const drafts = all.filter((p) => p.status === "draft");
  const posted = all.filter((p) => p.status === "posted_manually").slice(0, 10);

  // Calendar-lite: queued work grouped by scheduled week.
  const upcoming = [...pending, ...approved]
    .filter((p) => p.scheduled_date)
    .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1));
  const byWeek = new Map<string, SocialPostRow[]>();
  for (const p of upcoming) {
    const k = weekLabel(p.scheduled_date!);
    byWeek.set(k, [...(byWeek.get(k) ?? []), p]);
  }

  const hrefFor = (p: SocialPostRow) =>
    p.status === "approved" ? `/social/publish/${p.id}` : `/social/review/${p.id}`;

  return (
    <div>
      <PageHeader
        title="Social"
        subtitle="Generate, approve, and post — you stay in control of every post."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/social/brand"
              className="flex h-11 items-center rounded-button border border-border bg-white px-4 text-[15px] font-medium text-text-primary hover:border-primary/40"
            >
              Brand &amp; logo
            </Link>
            <Link
              href="/social/plan-week"
              className="flex h-11 items-center rounded-button border border-border bg-white px-4 text-[15px] font-medium text-text-primary hover:border-primary/40"
            >
              Plan my week
            </Link>
            <Link
              href="/social/new"
              className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
            >
              New post
            </Link>
          </div>
        }
      />

      {!voice ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 p-4">
          <p className="text-[15px] text-text-primary">
            Set your <span className="font-semibold">Brand Personality</span> once —
            every post will sound like your clinic.
          </p>
          <Link
            href="/social/brand"
            className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
          >
            Set it up (2 min)
          </Link>
        </div>
      ) : null}

      <StatGrid cols={3}>
        <StatCard
          label="Posts this month"
          value={`${quota.used} / ${quota.limit}`}
          hint={
            quota.used >= quota.limit
              ? "Monthly limit reached"
              : "1 credit per post · images free"
          }
          hero
        />
        <StatCard label="Waiting for approval" value={String(pending.length)} tone={pending.length > 0 ? "warning" : "default"} />
        <StatCard label="Ready to post" value={String(approved.length)} tone={approved.length > 0 ? "primary" : "default"} />
      </StatGrid>

      {quota.used >= quota.limit ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-white p-4">
          <p className="text-[15px] text-text-secondary">
            You&apos;ve used all {quota.limit} posts this month.
          </p>
          <Link
            href="/upgrade"
            className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
          >
            Upgrade for more
          </Link>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <>
          <SectionHeader hint="Approve, edit, or reject — nothing posts without you">
            Waiting for approval
          </SectionHeader>
          <div className="space-y-3">
            {pending.map((p) => (
              <PostRow key={p.id} post={p} href={`/social/review/${p.id}`} right={<StatusBadge status={p.status} />} />
            ))}
          </div>
        </>
      ) : null}

      {approved.length > 0 ? (
        <>
          <SectionHeader hint="Copy, download, and post — then mark as posted">
            Ready to post
          </SectionHeader>
          <div className="space-y-3">
            {approved.map((p) => (
              <PostRow key={p.id} post={p} href={`/social/publish/${p.id}`} right={<StatusBadge status={p.status} />} />
            ))}
          </div>
        </>
      ) : null}

      {byWeek.size > 0 ? (
        <>
          <SectionHeader hint="Grouped by week">Coming up</SectionHeader>
          <div className="space-y-6">
            {Array.from(byWeek.entries()).map(([week, list]) => (
              <div key={week}>
                <p className="mb-2 text-sm font-medium text-text-secondary">{week}</p>
                <div className="space-y-3">
                  {list.map((p) => (
                    <PostRow
                      key={`wk-${p.id}`}
                      post={p}
                      href={hrefFor(p)}
                      right={
                        <span className="text-xs text-text-secondary">
                          {p.scheduled_date ? formatDate(p.scheduled_date) : ""}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {drafts.length > 0 ? (
        <>
          <SectionHeader hint="Flagged drafts need an edit before they can queue">
            Drafts
          </SectionHeader>
          <div className="space-y-3">
            {drafts.map((p) => (
              <PostRow key={p.id} post={p} href={`/social/review/${p.id}`} right={<StatusBadge status={p.status} />} />
            ))}
          </div>
        </>
      ) : null}

      {posted.length > 0 ? (
        <>
          <SectionHeader>Recently posted</SectionHeader>
          <div className="space-y-3">
            {posted.map((p) => (
              <PostRow
                key={p.id}
                post={p}
                href={`/social/publish/${p.id}`}
                right={
                  <span className="text-xs font-medium text-success">
                    ✓ Posted{p.posted_at ? ` · ${formatDate(p.posted_at.slice(0, 10))}` : ""}
                  </span>
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {all.length === 0 ? (
        <div className="mt-8">
          <EmptyState>
            No posts yet. Start with{" "}
            <Link href="/social/plan-week" className="font-medium text-primary">
              Plan my week
            </Link>{" "}
            — answer 3 questions and get a week of posts to approve.
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
