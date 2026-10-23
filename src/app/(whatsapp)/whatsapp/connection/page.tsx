import { WhatsappConnectionForm } from "@/components/whatsapp/WhatsappConnectionForm";

export const metadata = {
  title: "WhatsApp connection",
};

export default function WhatsAppConnectionPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
          Cloud API connection
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          These credentials are only for WhatsApp alerts. SMTP for the email builder stays on its own
          connection page.
        </p>
      </header>
      <div className="wa-panel p-4 sm:p-6 md:p-8">
        <WhatsappConnectionForm />
      </div>
    </main>
  );
}
