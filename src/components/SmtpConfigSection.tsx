"use client";

import { useCallback, useEffect, useState } from "react";

type SmtpConfigRow = {
  id: string;
  host: string;
  port: number;
  username: string;
  passwordSet: boolean;
  encryption: "tls" | "ssl" | "none";
};

type FormState = {
  host: string;
  port: string;
  username: string;
  password: string;
  encryption: "tls" | "ssl" | "none";
};

const emptyForm: FormState = {
  host: "smtp.gmail.com",
  port: "587",
  username: "",
  password: "",
  encryption: "tls",
};

export function SmtpConfigSection({ standalone = false }: { standalone?: boolean }) {
  const [config, setConfig] = useState<SmtpConfigRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(standalone);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/smtp-configs");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const raw = (data.configs ?? []) as Record<string, unknown>[];
      const first = raw[0];
      if (!first) {
        setConfig(null);
        setForm(emptyForm);
        return;
      }
      const row: SmtpConfigRow = {
        id: String(first.id),
        host: String(first.host),
        port: Number(first.port),
        username: String(first.username),
        passwordSet: Boolean(first.passwordSet),
        encryption: first.encryption as FormState["encryption"],
      };
      setConfig(row);
      setForm({
        host: row.host,
        port: String(row.port),
        username: row.username,
        password: "",
        encryption: row.encryption,
      });
    } catch {
      setLoadError("Could not load SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSavedOk(false);
    const port = Number(form.port);
    if (!form.host.trim() || !Number.isFinite(port) || port < 1 || port > 65535) {
      setFormError("Enter a valid SMTP host and port (1–65535).");
      return;
    }
    if (!form.username.trim()) {
      setFormError("SMTP username is required.");
      return;
    }
    if (!config && !form.password) {
      setFormError("SMTP password is required.");
      return;
    }

    setSaving(true);
    try {
      if (config) {
        const body: Record<string, unknown> = {
          host: form.host.trim(),
          port,
          username: form.username.trim(),
          encryption: form.encryption,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/smtp-configs/${config.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error ?? "Save failed");
          return;
        }
      } else {
        const res = await fetch("/api/smtp-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            host: form.host.trim(),
            port,
            username: form.username.trim(),
            password: form.password,
            encryption: form.encryption,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error ?? "Save failed");
          return;
        }
      }
      setForm((f) => ({ ...f, password: "" }));
      setSavedOk(true);
      await load();
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    if (!config) return;
    if (!confirm("Remove saved SMTP settings? Env SMTP_* will still work if set.")) return;
    try {
      const res = await fetch(`/api/smtp-configs/${config.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConfig(null);
      setForm(emptyForm);
      setSavedOk(false);
      await load();
    } catch {
      /* ignore */
    }
  }

  const summary = config
    ? `${config.host}:${config.port} · ${config.username}`
    : "Using SMTP_* environment variables if set";

  const formContent = (
    <>
      {loading && <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>}
      {loadError && <div className="ui-alert ui-alert-error">{loadError}</div>}
      {!loading && !loadError && (
        <form onSubmit={onSave} className="space-y-4">
          {!standalone && (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">{summary}</p>
          )}
          {standalone && (
            <p className="rounded-lg border border-[var(--color-line)] bg-[#f8fafc] px-3 py-2 font-mono text-xs text-[var(--color-ink-muted)]">
              {summary}
            </p>
          )}

          <label className="block">
            <span className="ui-label">Host</span>
            <input
              required
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="smtp.gmail.com"
              className="app-input"
              autoComplete="off"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="ui-label">Port</span>
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                className="app-input"
              />
            </label>
            <label className="block">
              <span className="ui-label">Encryption</span>
              <select
                value={form.encryption}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    encryption: e.target.value as FormState["encryption"],
                  }))
                }
                className="app-input"
              >
                <option value="tls">TLS (STARTTLS)</option>
                <option value="ssl">SSL (port 465)</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="ui-label">Username</span>
            <input
              required
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="you@gmail.com"
              className="app-input"
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="ui-label">Password</span>
            <div className="relative">
              <input
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                type={showPassword ? "text" : "password"}
                placeholder={
                  config?.passwordSet ? "Leave blank to keep current password" : "App password"
                }
                className="app-input pr-16"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-[var(--color-ink-muted)] hover:bg-[#eef2f6] hover:text-[var(--color-ink)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {formError && <div className="ui-alert ui-alert-error">{formError}</div>}
          {savedOk && !formError && <div className="ui-alert ui-alert-ok">Saved.</div>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
            {config && (
              <button type="button" onClick={() => void onClear()} className="ui-btn ui-btn-danger">
                Clear
              </button>
            )}
          </div>
        </form>
      )}
    </>
  );

  if (standalone) {
    return <div className="ui-panel p-4 sm:p-6 md:p-8">{formContent}</div>;
  }

  return (
    <section className="min-w-0">
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]">
          Connection
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          One SMTP account for sending.
        </p>
      </div>

      <div className="ui-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[#f8fafc] sm:px-5"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-ink)]">SMTP</p>
            <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-ink-muted)]">
              {summary}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[var(--color-accent)]">
            {open ? "Hide" : "Edit"}
          </span>
        </button>

        {open && (
          <div className="border-t border-[var(--color-line)] px-4 py-4 sm:px-5 sm:py-5">
            {formContent}
          </div>
        )}
      </div>
    </section>
  );
}
