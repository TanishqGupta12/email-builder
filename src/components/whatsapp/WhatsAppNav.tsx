"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/whatsapp", label: "Compose" },
  { href: "/whatsapp/history", label: "History" },
  { href: "/whatsapp/connection", label: "Connection" },
] as const;

export function WhatsAppNav() {
  const pathname = usePathname();

  return (
    <header className="wa-topbar">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/whatsapp" className="min-w-0 no-underline">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-deep)]">
            Alerts
          </p>
          <p className="font-display truncate text-base font-semibold tracking-tight text-[var(--color-ink)]">
            WhatsApp portal
          </p>
        </Link>
        <nav className="flex shrink-0 items-center gap-1 text-xs font-semibold sm:gap-1.5 sm:text-sm">
          <Link
            href="/"
            className="mr-1 rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-[var(--color-ink)] no-underline shadow-sm transition hover:border-[var(--color-accent)] sm:mr-2 sm:px-3"
          >
            Email builder
          </Link>
          {links.map((link) => {
            const active =
              link.href === "/whatsapp"
                ? pathname === "/whatsapp"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-2.5 py-1.5 no-underline transition sm:px-3 ${
                  active
                    ? "bg-[var(--color-accent-deep)] text-white shadow-sm"
                    : "text-[var(--color-ink-muted)] hover:bg-white/80 hover:text-[var(--color-ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
