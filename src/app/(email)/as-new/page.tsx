import { MailApp } from "@/components/mail/MailApp";

export const metadata = {
  title: "Mail · Postline",
};

export default function AsNewPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
        <header className="rise-in px-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
            Mail
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-muted)]">
            Gmail-style inbox with folders, categories, search, compose, reply, schedule, and
            snooze — synced with your email account.
          </p>
        </header>
        <div className="rise-in rise-in-delay-1 min-h-0">
          <MailApp />
        </div>
    </main>
  );
}
