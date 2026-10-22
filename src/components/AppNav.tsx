"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Compose" },
  { href: "/history", label: "History" },
  { href: "/recipients", label: "Recipients" },
  { href: "/connection", label: "Connection" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="ui-topbar">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0 no-underline">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Postline
          </p>
          <p className="font-display truncate text-base font-semibold tracking-tight text-[var(--color-ink)]">
            Email builder
          </p>
        </Link>
        <nav className="flex shrink-0 items-center gap-1 text-xs font-semibold sm:gap-1.5 sm:text-sm">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-2.5 py-1.5 no-underline transition sm:px-3 ${
                  active
                    ? "bg-white text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink-muted)] hover:bg-white/70 hover:text-[var(--color-ink)]"
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
