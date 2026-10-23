import { ComposerForm } from "@/components/ComposerForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-10 px-4 py-8 sm:gap-12 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <section className="rise-in grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h1 className="font-display max-w-xl text-balance text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Write once.
              <span className="mt-1 block text-[var(--color-accent)]">Send with control.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)] sm:text-base">
              Compose your message, add recipients, and send one-by-one through SMTP.
            </p>
          </div>
          <div className="ui-panel hidden p-5 sm:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              Workflow
            </p>
            <ol className="mt-3 space-y-2.5 text-sm text-[var(--color-ink)]">
              <li className="flex gap-2.5">
                <span className="font-display font-semibold text-[var(--color-accent)]">1</span>
                Compose subject &amp; message
              </li>
              <li className="flex gap-2.5">
                <span className="font-display font-semibold text-[var(--color-accent)]">2</span>
                Paste or import recipients
              </li>
              <li className="flex gap-2.5">
                <span className="font-display font-semibold text-[var(--color-accent)]">3</span>
                Send, then reuse from History
              </li>
            </ol>
          </div>
        </section>

        <section id="compose-section" className="rise-in rise-in-delay-1 min-w-0">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink)]">
              Compose
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Everything for a campaign in one place.
            </p>
          </div>
          <div className="ui-panel p-4 sm:p-6 md:p-8">
            <ComposerForm />
          </div>
        </section>
    </main>
  );
}
