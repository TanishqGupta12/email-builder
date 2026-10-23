import { WhatsappHistory } from "@/components/whatsapp/WhatsappHistory";

export const metadata = {
  title: "WhatsApp history",
};

export default function WhatsAppHistoryPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
          Delivery history
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Each broadcast keeps its own numbers, status, and attachment. Email campaigns stay on the
          email history page.
        </p>
      </header>
      <div className="wa-panel overflow-hidden">
        <WhatsappHistory />
      </div>
    </main>
  );
}
