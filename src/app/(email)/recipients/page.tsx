import { RecipientsList } from "@/components/RecipientsList";

export const metadata = {
  title: "Recipients · Postline",
};

export default function RecipientsPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="rise-in">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            Recipients
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)] sm:text-base">
            Everyone you have emailed. View or reuse past messages, or permanently delete selected
            or all recipient records.
          </p>
        </header>
        <div className="rise-in rise-in-delay-1 ui-panel overflow-hidden">
          <RecipientsList />
        </div>
    </main>
  );
}
