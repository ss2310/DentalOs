"use client";

import { useState } from "react";
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
  GenerateIcon,
  ReviewsIcon,
  SettingsIcon,
  BellIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
} from "@/components/icons";
import { signOutAction } from "@/app/actions";

const NAV = [
  { label: "Dashboard", href: "/dashboard", Icon: HomeIcon },
  { label: "Appointments", href: "/appointments", Icon: CalendarIcon },
  { label: "Patients", href: "/patients", Icon: PatientsIcon },
  { label: "Billing", href: "/billing", Icon: BillingIcon },
  { label: "Pipeline", href: "/pipeline", Icon: PipelineIcon },
  { label: "Recalls", href: "/recalls", Icon: RecallsIcon },
  { label: "Leads", href: "/leads", Icon: LeadsIcon },
  { label: "Generate", href: "/generate", Icon: GenerateIcon },
  { label: "Reviews", href: "/reviews", Icon: ReviewsIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

export function AppShell({
  clinicName,
  children,
}: {
  clinicName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ label, href, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={`flex min-h-[44px] items-center gap-3 rounded-button px-3 text-[15px] font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:bg-subtle hover:text-text-primary"
            }`}
          >
            <Icon className={active ? "text-primary" : "text-text-secondary"} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-subtle">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white px-3 py-5 md:flex">
        <div className="px-3 pb-5">
          <span className="text-lg font-semibold text-primary">GrowthOS</span>
        </div>
        {navLinks}
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-text-primary/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-white px-3 py-5">
            <div className="flex items-center justify-between px-3 pb-5">
              <span className="text-lg font-semibold text-primary">
                GrowthOS
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
              >
                <CloseIcon />
              </button>
            </div>
            {navLinks}
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
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
            >
              <BellIcon />
            </button>
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
    </div>
  );
}
