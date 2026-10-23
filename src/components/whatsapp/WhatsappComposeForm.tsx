"use client";

import { useState } from "react";
import { useWaSendProgress } from "@/components/whatsapp/WaSendProgressProvider";

export function WhatsappComposeForm() {
  const { startSend, starting } = useWaSendProgress();
  const [message, setMessage] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [delaySeconds, setDelaySeconds] = useState("1.5");
  const [csvName, setCsvName] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setInvalid([]);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("attachment");
    if (file instanceof File && file.size === 0) data.delete("attachment");
    const result = await startSend(data, message.trim());
    if (!result.ok) {
      setError(result.error);
      setInvalid(result.invalid ?? []);
      return;
    }
    setInvalid(result.invalid ?? []);
    const skipped = result.invalid?.length ?? 0;
    setNotice(
      skipped > 0
        ? `Started. ${skipped} row${skipped === 1 ? "" : "s"} could not be read as a phone number.`
        : "Started. Messages go out one number at a time.",
    );
    form.reset();
    setMessage("");
    setNumbersText("");
    setDelaySeconds("1.5");
    setCsvName(null);
    setAttachmentName(null);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div>
        <label className="ui-label" htmlFor="wa-message">
          Alert text
        </label>
        <textarea
          id="wa-message"
          name="message"
          required
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="The text that fills {{1}} in your approved template"
          className="app-input min-h-32 resize-y"
        />
        <p className="ui-hint">
          Line breaks are turned into spaces before send. Meta delivers this as a template variable,
          so the template body should be a single <span className="font-mono">{"{{1}}"}</span>.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="ui-label" htmlFor="wa-csv">
            CSV of numbers
          </label>
          <label className="ui-dropzone">
            <input
              id="wa-csv"
              name="csvFile"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setCsvName(event.target.files?.[0]?.name ?? null)}
            />
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              {csvName ?? "Drop a CSV or browse"}
            </span>
            <span className="text-xs text-[var(--color-ink-muted)]">
              Looks for a phone, mobile, WhatsApp, or number column
            </span>
          </label>
        </div>
        <div>
          <label className="ui-label" htmlFor="wa-attachment">
            One attachment
          </label>
          <label className="ui-dropzone">
            <input
              id="wa-attachment"
              name="attachment"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setAttachmentName(file ? file.name : null);
              }}
            />
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              {attachmentName ?? "Image, PDF, or document"}
            </span>
            <span className="text-xs text-[var(--color-ink-muted)]">
              Optional. One file, up to 10 MB, sent as the template header.
            </span>
          </label>
        </div>
      </div>

      <div>
        <label className="ui-label" htmlFor="wa-numbers">
          Or paste numbers
        </label>
        <textarea
          id="wa-numbers"
          name="numbersText"
          rows={4}
          value={numbersText}
          onChange={(event) => setNumbersText(event.target.value)}
          placeholder={"14155552671\n447700900123"}
          className="app-input min-h-24 resize-y font-mono text-sm"
        />
        <p className="ui-hint">Include the country code. Example: 14155552671.</p>
      </div>

      <div className="max-w-xs">
        <label className="ui-label" htmlFor="wa-delay">
          Pause between numbers (seconds)
        </label>
        <input
          id="wa-delay"
          name="delaySeconds"
          type="number"
          min={0.5}
          step={0.5}
          value={delaySeconds}
          onChange={(event) => setDelaySeconds(event.target.value)}
          className="app-input"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-[#fecdca] bg-[#fff5f4] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-sm text-[var(--color-ok)]">
          {notice}
        </p>
      )}
      {invalid.length > 0 && (
        <div className="rounded-xl border border-[#fedf89] bg-[#fffaeb] px-3 py-2 text-sm text-[var(--color-warn)]">
          <p className="font-semibold">Skipped</p>
          <p className="mt-1 break-words">{invalid.slice(0, 12).join(", ")}{invalid.length > 12 ? "…" : ""}</p>
        </div>
      )}

      <div>
        <button type="submit" disabled={starting} className="ui-btn ui-btn-primary w-full sm:w-auto">
          {starting ? "Starting…" : "Start sequential send"}
        </button>
      </div>
    </form>
  );
}
