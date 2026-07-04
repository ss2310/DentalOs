"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/clinics", label: "Clinics" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/usage", label: "Usage & Costs" },
  { href: "/admin/system", label: "System" },
];

export function AdminNav({ showVerticals = false }: { showVerticals?: boolean }) {
  const pathname = usePathname();
  // Verticals is gated by ENABLE_MULTI_VERTICAL — hidden entirely when off.
  const links = showVerticals
    ? [...LINKS, { href: "/admin/verticals", label: "Verticals" }]
    : LINKS;
  // Exact match for the overview root so it isn't "active" on every /admin/* page.
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {links.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-button px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[#4F46E5] text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
