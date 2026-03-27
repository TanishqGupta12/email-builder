import { CampaignList } from "@/components/CampaignList";
import { ComposerForm } from "@/components/ComposerForm";
import { SmtpConfigSection } from "@/components/SmtpConfigSection";

export default function Home() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-3 py-6 sm:gap-8 sm:px-4 sm:py-10 md:px-6 lg:px-8 lg:py-14">
      <header className="app-card px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2 sm:space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-400/90 sm:text-xs">
              Gmail SMTP
            </p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
              Bulk email
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-sm">
              Compose rich HTML messages, attach files, import recipients from CSV or paste, and send
              through Google SMTP with optional delays. Track deliveries in recent campaigns above.
            </p>
          </div>
          <div className="hidden shrink-0 sm:block sm:pt-1" aria-hidden>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 shadow-inner shadow-blue-950/50 sm:h-14 sm:w-14">
              <svg
                className="h-6 w-6 text-blue-400 sm:h-7 sm:w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
          </div>
        </div>
      </header>

      <SmtpConfigSection />

      <section className="min-w-0 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 to-blue-700 shadow-[0_0_12px_rgba(59,130,246,0.5)] sm:h-7" />
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Recent campaigns
          </h2>
        </div>
        <div className="app-card overflow-hidden p-0">
          <CampaignList />
        </div>
      </section>

      <section className="min-w-0 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 to-blue-700 shadow-[0_0_12px_rgba(59,130,246,0.5)] sm:h-7" />
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Compose & send
          </h2>
        </div>
        <div className="app-card p-4 sm:p-6 md:p-8">
          <ComposerForm />
        </div>
      </section>
    </main>
  );
}
