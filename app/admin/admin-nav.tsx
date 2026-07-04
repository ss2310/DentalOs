"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/clinics", label: "Clinics" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/usage", label: "Usage & Costs" },
  { href: "/admin/system", label: "System" },
];

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((l) => {
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
