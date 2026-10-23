"use client";

import { useEffect, useState } from "react";

type Connection = {
  phoneNumberId: string;
  templateName: string;
  templateLanguage: string;
  tokenSet: boolean;
  tokenHint: string | null;
};

export function WhatsappConnectionForm() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [templateName, setTemplateName] = useState("alert");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [tokenSet, setTokenSet] = useState(false);
  const [tokenHint, setTokenHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whatsapp/connection");
        const data = await res.json();
        if (cancelled) return;
        const connection = data.connection as Connection | null;
        if (connection) {
          setPhoneNumberId(connection.phoneNumberId);
          setTemplateName(connection.templateName);
          setTemplateLanguage(connection.templateLanguage);
          setTokenSet(connection.tokenSet);
          setTokenHint(connection.tokenHint);
        }
      } catch {
        if (!cancelled) setError("Could not load the WhatsApp connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/whatsapp/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          accessToken,
          templateName,
          templateLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      const connection = data.connection as Connection | null;
      setTokenSet(Boolean(connection?.tokenSet));
      setTokenHint(connection?.tokenHint ?? null);
      setAccessToken("");
      setSaved(true);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Loading connection…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div>
        <label className="ui-label" htmlFor="wa-phone-id">
          Phone number ID
        </label>
        <input
          id="wa-phone-id"
          value={phoneNumberId}
          onChange={(event) => setPhoneNumberId(event.target.value)}
          className="app-input font-mono"
          placeholder="From Meta Business settings"
          required
        />
      </div>
      <div>
        <label className="ui-label" htmlFor="wa-token">
          Access token
        </label>
        <input
          id="wa-token"
          type="password"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          className="app-input"
          placeholder={tokenSet ? "Saved token stays unless you replace it" : "Permanent token"}
          autoComplete="off"
          required={!tokenSet}
        />
        {tokenHint && (
          <p className="ui-hint">A token is saved. It ends in {tokenHint}.</p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="ui-label" htmlFor="wa-template">
            Template name
          </label>
          <input
            id="wa-template"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="app-input font-mono"
            required
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="wa-language">
            Template language
          </label>
          <input
            id="wa-language"
            value={templateLanguage}
            onChange={(event) => setTemplateLanguage(event.target.value)}
            className="app-input font-mono"
            placeholder="en or en_US"
            required
          />
        </div>
      </div>
      <p className="ui-hint">
        The approved template needs a body variable {"{{1}}"}. Add a document, image, or video header
        only when this portal sends an attachment.
      </p>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {saved && <p className="text-sm text-[var(--color-ok)]">Connection saved.</p>}
      <div>
        <button type="submit" disabled={saving} className="ui-btn ui-btn-primary">
          {saving ? "Saving…" : "Save connection"}
        </button>
      </div>
    </form>
  );
}
