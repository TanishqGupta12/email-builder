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
      <section className="wa-panel p-4 sm:p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]">
          Set it up from a Meta app
        </h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-ink)]">
          <li className="flex gap-3">
            <span className="font-display font-semibold text-[var(--color-accent-deep)]">1</span>
            <p>
              Open{" "}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--color-accent-deep)] underline"
              >
                developers.facebook.com/apps
              </a>{" "}
              while logged in as the same user.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="font-display font-semibold text-[var(--color-accent-deep)]">2</span>
            <p>Click Create app. On Add use cases, tick Connect with customers through WhatsApp, then Next.</p>
          </li>
          <li className="flex gap-3">
            <span className="font-display font-semibold text-[var(--color-accent-deep)]">3</span>
            <p>Finish creating the app. Leave the ads, Threads, games, and Facebook Login use cases unchecked.</p>
          </li>
          <li className="flex gap-3">
            <span className="font-display font-semibold text-[var(--color-accent-deep)]">4</span>
            <p>Open the app, then WhatsApp, then API setup.</p>
          </li>
        </ol>
        <div className="mt-5 space-y-3 border-t border-[var(--color-line)] pt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          <p>
            <span className="font-semibold text-[var(--color-ink)]">Phone number ID</span> is the long
            number on that screen. It is not an email and not your mobile number. Copy it into Phone
            number ID below.
          </p>
          <p>
            <span className="font-semibold text-[var(--color-ink)]">Temporary access token</span> goes
            into Access token. It expires in about 24 hours. For ongoing use, create a permanent token
            in Business settings under System users.
          </p>
        </div>
      </section>
      <div className="wa-panel p-4 sm:p-6 md:p-8">
        <WhatsappConnectionForm />
      </div>
    </main>
  );
}
