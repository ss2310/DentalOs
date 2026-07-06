"use client";

import { useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  CalendarIcon,
  PatientsIcon,
  BillingIcon,
  PipelineIcon,
  RecallsIcon,
  LeadsIcon,
  RecoveryIcon,
  GenerateIcon,
  ReviewsIcon,
  CampaignsIcon,
  SettingsIcon,
  BellIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
  ChevronDownIcon,
  MapPinIcon,
  SwordsIcon,
  SearchIcon,
  ToothIcon,
  AiVisibilityIcon,
  UpgradeIcon,
  ShieldIcon,
  MicIcon,
} from "@/components/icons";
import { Toaster } from "@/components/toast";
import { HowItWorks } from "@/components/how-it-works";
import { HelpChat } from "@/components/help-chat";
import { VoiceNoteButton } from "@/components/voice-note-button";
import { signOutAction } from "@/app/actions";

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;
// `flag` gates a leaf behind a per-clinic feature flag (currently only voice
// notes). When set, the item shows only if the matching prop is true.
type NavLeaf = {
  label: string;
  href: string;
  Icon: IconType;
  adminOnly?: boolean;
  flag?: "voiceNotes";
};
type NavGroup = { label: string; items: NavLeaf[]; adminOnly?: boolean };
type NavEntry = NavLeaf | NavGroup;

// Dashboard + Settings stay flat as the top/bottom anchors. Everything else is
// grouped by the patient journey (mirrors components/how-it-works.tsx): Get
// patients in → Run the clinic → Get paid & keep them, then Marketing. Group
// labels and item names are written the way a busy receptionist thinks, not as
// the underlying DB modules (Leads→Enquiries, Pipeline→Treatment Plans,
// Billing→Payments, Recalls→Check-up Reminders, Recovery→Revenue Recovered).
const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", Icon: HomeIcon },
  {
    label: "Get Patients In",
    items: [
      { label: "Enquiries", href: "/leads", Icon: LeadsIcon },
      { label: "Treatment Plans", href: "/pipeline", Icon: PipelineIcon },
    ],
  },
  {
    label: "Run the Clinic",
    items: [
      { label: "Appointments", href: "/appointments", Icon: CalendarIcon },
      { label: "Patients", href: "/patients", Icon: PatientsIcon },
      { label: "Notes", href: "/notes", Icon: MicIcon, flag: "voiceNotes" },
    ],
  },
  {
    label: "Get Paid & Keep Them",
    items: [
      { label: "Payments", href: "/billing", Icon: BillingIcon },
      { label: "Check-up Reminders", href: "/recalls", Icon: RecallsIcon },
      { label: "Reviews", href: "/reviews", Icon: ReviewsIcon },
      { label: "Campaigns", href: "/campaigns", Icon: CampaignsIcon },
      { label: "Revenue Recovered", href: "/recovery", Icon: RecoveryIcon, adminOnly: true },
    ],
  },
  {
    label: "Marketing",
    adminOnly: true,
    items: [
      { label: "AI Visibility", href: "/ai-visibility", Icon: AiVisibilityIcon },
      { label: "Generate", href: "/generate", Icon: GenerateIcon },
      { label: "Map Rank", href: "/rank", Icon: MapPinIcon },
      { label: "Competitors", href: "/competitors", Icon: SwordsIcon },
      { label: "Deep Audit", href: "/audit", Icon: SearchIcon },
    ],
  },
  { label: "Settings", href: "/settings", Icon: SettingsIcon, adminOnly: true },
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

// Sidebar is a quiet light rail ("Clinical Minimal"): neutral text on
// near-white, a soft fill on the active item, and teal reserved for the
// active icon — the one accent.
const linkClass = (active: boolean) =>
  `flex min-h-[44px] items-center gap-3 rounded-button px-3 text-[15px] transition-colors ${
    active
      ? "bg-black/[0.05] font-medium text-text-primary"
      : "font-normal text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
  }`;

const iconClass = (active: boolean) =>
  active ? "text-primary" : "text-text-secondary/70";

export function AppShell({
  clinicName,
  unreadCount = 0,
  isAgency = false,
  isAdmin = false,
  isSuperAdmin = false,
  pastDue = false,
  voiceNotes = false,
  children,
}: {
  clinicName: string;
  unreadCount?: number;
  isAgency?: boolean;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  pastDue?: boolean;
  voiceNotes?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Prospecting is an agency-only tool — inject it just above Settings (the last
  // anchor) for agency users; everyone else never sees the link.
  const nav: NavEntry[] = isAgency
    ? [
        ...NAV.slice(0, -1),
        { label: "Prospecting", href: "/prospect", Icon: SearchIcon },
        NAV[NAV.length - 1],
      ]
    : NAV;

  // A leaf gated by a feature flag shows only when that flag is on for the clinic.
  const flagAllows = (leaf: NavLeaf) =>
    !leaf.flag || (leaf.flag === "voiceNotes" && voiceNotes);

  // Receptionists get the front-desk subset; owner/doctor (isAdmin) see all.
  // Drop admin-only leaves, flag-gated leaves that are off, and any group that's
  // admin-only or left empty.
  const visibleNav: NavEntry[] = nav
    .map((entry) => {
      if (isGroup(entry)) {
        if (entry.adminOnly && !isAdmin) return null;
        const items = entry.items.filter(
          (i) => (isAdmin || !i.adminOnly) && flagAllows(i),
        );
        return items.length ? { ...entry, items } : null;
      }
      return (isAdmin || !entry.adminOnly) && flagAllows(entry) ? entry : null;
    })
    .filter((e): e is NavEntry => e !== null);
  // The platform-owner entry — a flat, pinned item shown ONLY to super admins
  // (gated by is_super_admin, not by clinic role). Absolute /admin href so it
  // never resolves relative to the current page.
  const finalNav: NavEntry[] = isSuperAdmin
    ? [...visibleNav, { label: "Admin", href: "/admin", Icon: ShieldIcon }]
    : visibleNav;
  // Explicit expand/collapse overrides, keyed by group label. When a group has
  // no entry here it defaults to open iff it contains the current page.
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const groupActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
  const isExpanded = (g: NavGroup) => openState[g.label] ?? groupActive(g);

  const navContent = (onNavigate: () => void) => (
    <nav className="flex flex-col gap-1">
      {finalNav.map((entry) => {
        if (!isGroup(entry)) {
          const active = isActive(entry.href);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              onClick={onNavigate}
              className={linkClass(active)}
            >
              <entry.Icon className={iconClass(active)} />
              {entry.label}
            </Link>
          );
        }

        const gActive = groupActive(entry);
        const expanded = isExpanded(entry);
        return (
          <div key={entry.label}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setOpenState((s) => ({ ...s, [entry.label]: !expanded }))
              }
              className={`mt-2 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-button px-3 text-[13px] font-semibold uppercase tracking-[0.07em] transition-colors hover:bg-black/[0.03] ${
                gActive ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              <span>{entry.label}</span>
              <ChevronDownIcon
                width={16}
                height={16}
                className={`text-text-secondary/50 transition-transform ${
                  expanded ? "" : "-rotate-90"
                }`}
              />
            </button>
            {expanded ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {entry.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={linkClass(active)}
                    >
                      <item.Icon className={iconClass(active)} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-subtle">
      {/* Desktop sidebar — quiet light rail, hairline edge */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-button bg-primary/10 text-primary">
            <ToothIcon width={20} height={20} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-text-primary">
            GrowthOS
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">{navContent(() => {})}</div>
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-white px-3 py-5">
            <div className="flex items-center justify-between px-3 pb-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-button bg-primary/10 text-primary">
                  <ToothIcon width={20} height={20} />
                </span>
                <span className="text-lg font-semibold tracking-tight text-text-primary">
                  GrowthOS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-black/[0.04]"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {navContent(() => setMobileOpen(false))}
            </div>
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-subtle md:hidden"
            >
              <MenuIcon />
            </button>
            <span className="truncate text-[15px] font-semibold text-text-primary">
              {clinicName}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {voiceNotes ? (
              <VoiceNoteButton patientId={null} variant="icon" reviewInline />
            ) : null}
            <Link
              href="/upgrade"
              className="flex h-11 items-center gap-2 rounded-button px-3 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <UpgradeIcon width={18} height={18} />
              <span className="hidden sm:inline">Upgrade</span>
            </Link>
            <HowItWorks />
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              className="relative flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
            >
              <BellIcon />
              {unreadCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Log out"
                className="flex h-11 items-center gap-2 rounded-button px-3 text-sm font-medium text-text-secondary hover:bg-subtle"
              >
                <LogoutIcon />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </form>
          </div>
        </header>

        {pastDue ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 sm:px-6">
            <p className="text-sm font-medium text-warning">
              Your trial has ended — upgrade to keep your account active.
            </p>
            <Link
              href="/upgrade"
              className="flex h-9 items-center gap-2 rounded-button bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90"
            >
              <UpgradeIcon width={16} height={16} />
              Upgrade
            </Link>
          </div>
        ) : null}

        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <HelpChat isAdmin={isAdmin} />
      <Toaster />
    </div>
  );
}
