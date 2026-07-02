import type { SVGProps } from "react";

// Simple inline outline icons (no icon library — see CLAUDE.md rule 7).
// All use currentColor so they inherit text color for active/inactive states.

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75V16.5A1.125 1.125 0 0110.875 15.375h2.25A1.125 1.125 0 0114.25 16.5v4.5h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </Base>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 8.25h18M4.5 5.25h15A1.5 1.5 0 0121 6.75v12A1.5 1.5 0 0119.5 20.25h-15A1.5 1.5 0 013 18.75v-12A1.5 1.5 0 014.5 5.25z" />
    </Base>
  );
}

export function PatientsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
    </Base>
  );
}

export function BillingIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M2.25 8.25h19.5M2.25 9A2.25 2.25 0 014.5 6.75h15A2.25 2.25 0 0121.75 9v6A2.25 2.25 0 0119.5 17.25h-15A2.25 2.25 0 012.25 15V9zM6 13.5h4" />
    </Base>
  );
}

export function PipelineIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.75 4.5h16.5L13.5 12.75v6l-3 1.5v-7.5L3.75 4.5z" />
    </Base>
  );
}

export function RecallsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 12a7.5 7.5 0 0113.06-5.03M19.5 6v3.75h-3.75M19.5 12a7.5 7.5 0 01-13.06 5.03M4.5 18v-3.75h3.75" />
    </Base>
  );
}

export function LeadsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM3.75 20.25a6.75 6.75 0 0112.032-4.243M18 12.75v4.5M20.25 15h-4.5" />
    </Base>
  );
}

export function GenerateIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9.75 3.75l1.5 3.75 3.75 1.5-3.75 1.5-1.5 3.75-1.5-3.75L4.5 10.5l3.75-1.5 1.5-3.75zM18 13.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </Base>
  );
}

export function ReviewsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M11.48 3.5l2.06 4.18 4.61.67-3.34 3.25.79 4.59L11.48 18l-4.12 2.17.79-4.59-3.34-3.25 4.61-.67L11.48 3.5z" />
    </Base>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 4.5v6m0 3v6M6 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 4.5v3m0 3v9M12 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 4.5v9m0 3v3M18 16.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </Base>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </Base>
  );
}

export function LogoutIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H2.25" />
    </Base>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </Base>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 18L18 6M6 6l12 12" />
    </Base>
  );
}
