import { SmtpConfigSection } from "@/components/SmtpConfigSection";

export const metadata = {
  title: "Connection · Postline",
};

export default function ConnectionPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="rise-in">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            Connection
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)] sm:text-base">
            Configure the SMTP account used to send campaigns and power Mail (IMAP is derived
            automatically, e.g. imap.gmail.com for Gmail).
          </p>
        </header>
        <div className="rise-in rise-in-delay-1">
          <SmtpConfigSection standalone />
        </div>
    </main>
  );
}
