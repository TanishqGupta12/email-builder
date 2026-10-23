import { WhatsappComposeForm } from "@/components/whatsapp/WhatsappComposeForm";

export default function WhatsAppComposePage() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:py-10">
      <aside className="wa-panel h-fit p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-deep)]">
          Sequence
        </p>
        <ol className="mt-4 space-y-4 text-sm text-[var(--color-ink)]">
          <li>
            <p className="font-display font-semibold">1. Load numbers</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">CSV column or a pasted list, with country codes.</p>
          </li>
          <li>
            <p className="font-display font-semibold">2. Write the alert</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">This text fills the template variable.</p>
          </li>
          <li>
            <p className="font-display font-semibold">3. Send in order</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">Each number is contacted, then the next waits.</p>
          </li>
        </ol>
      </aside>
      <section>
        <header className="mb-5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            Send an alert
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Upload the list, write the message, and start. Delivery stays inside this portal and does
            not use the email campaign queue.
          </p>
        </header>
        <div className="wa-panel p-4 sm:p-6 md:p-8">
          <WhatsappComposeForm />
        </div>
      </section>
    </main>
  );
}
