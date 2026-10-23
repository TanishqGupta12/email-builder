import { OpeningsImport } from "@/components/OpeningsImport";

export const metadata = {
  title: "Openings · Postline",
};

export default function OpeningsPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[96rem] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="rise-in">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
          Openings
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)] sm:text-base">
          Upload a WhatsApp chat export. Each job message becomes a row with every extracted
          field, and the filters narrow both the table and the CSV download.
        </p>
      </header>
      <div className="rise-in rise-in-delay-1 ui-panel overflow-hidden">
        <OpeningsImport />
      </div>
    </main>
  );
}
