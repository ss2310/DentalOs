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
} from "@/components/icons";
import { Toaster } from "@/components/toast";
import { signOutAction } from "@/app/actions";

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;
type NavLeaf = { label: string; href: string; Icon: IconType };
type NavGroup = { label: string; items: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

// Dashboard + Settings stay flat as the top/bottom anchors; everything else is
// split into two collapsible groups: day-to-day clinic work vs. marketing.
const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", Icon: HomeIcon },
  {
    label: "Clinic Operations",
    items: [
      { label: "Appointments", href: "/appointments", Icon: CalendarIcon },
      { label: "Patients", href: "/patients", Icon: PatientsIcon },
      { label: "Billing", href: "/billing", Icon: BillingIcon },
      { label: "Pipeline", href: "/pipeline", Icon: PipelineIcon },
      { label: "Recalls", href: "/recalls", Icon: RecallsIcon },
      { label: "Leads", href: "/leads", Icon: LeadsIcon },
      { label: "Recovery", href: "/recovery", Icon: RecoveryIcon },
      { label: "Reviews", href: "/reviews", Icon: ReviewsIcon },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Generate", href: "/generate", Icon: GenerateIcon },
      { label: "Map Rank", href: "/rank", Icon: MapPinIcon },
      { label: "Competitors", href: "/competitors", Icon: SwordsIcon },
    ],
  },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

// Sidebar rail is deep teal ("ink"), so nav uses light-on-dark treatment with a
// mint accent for the active item.
const linkClass = (active: boolean) =>
  `flex min-h-[44px] items-center gap-3 rounded-button px-3 text-[15px] font-medium transition-colors ${
    active
      ? "bg-white/10 text-white"
      : "text-white/65 hover:bg-white/5 hover:text-white"
  }`;

const iconClass = (active: boolean) => (active ? "text-mint" : "text-white/55");

export function AppShell({
  clinicName,
  unreadCount = 0,
  isAgency = false,
  children,
}: {
  clinicName: string;
  unreadCount?: number;
  isAgency?: boolean;
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
  // Explicit expand/collapse overrides, keyed by group label. When a group has
  // no entry here it defaults to open iff it contains the current page.
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const groupActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
  const isExpanded = (g: NavGroup) => openState[g.label] ?? groupActive(g);

  const navContent = (onNavigate: () => void) => (
    <nav className="flex flex-col gap-1">
      {nav.map((entry) => {
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
              className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-button px-3 text-[15px] font-medium transition-colors hover:bg-white/5 ${
                gActive ? "text-white" : "text-white/65"
              }`}
            >
              <span>{entry.label}</span>
              <ChevronDownIcon
                width={16}
                height={16}
                className={`text-white/50 transition-transform ${
                  expanded ? "" : "-rotate-90"
                }`}
              />
            </button>
            {expanded ? (
              <div className="mt-1 flex flex-col gap-1 border-l border-white/10 pl-2">
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
      {/* Desktop sidebar — deep teal rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-button bg-mint/15 text-mint">
            <ToothIcon width={20} height={20} />
          </span>
          <span className="font-display text-lg font-semibold text-white">
            GrowthOS
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">{navContent(() => {})}</div>
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-text-primary/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink px-3 py-5">
            <div className="flex items-center justify-between px-3 pb-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-button bg-mint/15 text-mint">
                  <ToothIcon width={20} height={20} />
                </span>
                <span className="font-display text-lg font-semibold text-white">
                  GrowthOS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-button text-white/70 hover:bg-white/10"
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
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-4 sm:px-6">
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

        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
