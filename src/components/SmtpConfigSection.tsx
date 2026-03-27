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

const labelClass = "text-xs font-medium text-slate-300";
const inputClass =
  "app-input w-full px-3 py-2.5 text-sm placeholder:text-slate-500";

type FormState = {
  host: string;
  port: string;
  username: string;
  password: string;
  encryption: "tls" | "ssl" | "none";
};

const emptyForm: FormState = {
  host: "",
  port: "587",
  username: "",
  password: "",
  encryption: "tls",
};

export function SmtpConfigSection() {
  const [configs, setConfigs] = useState<SmtpConfigRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/smtp-configs");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const raw = (data.configs ?? []) as Record<string, unknown>[];
      setConfigs(
        raw.map((c) => ({
          id: String(c.id),
          host: String(c.host),
          port: Number(c.port),
          username: String(c.username),
          passwordSet: Boolean(c.passwordSet),
          encryption: c.encryption as FormState["encryption"],
        })),
      );
    } catch {
      setLoadError("Could not load SMTP configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowPassword(false);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c: SmtpConfigRow) {
    setEditingId(c.id);
    setForm({
      host: c.host,
      port: String(c.port),
      username: c.username,
      password: "",
      encryption: c.encryption,
    });
    setShowPassword(false);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const port = Number(form.port);
    if (!form.host.trim() || !Number.isFinite(port) || port < 1 || port > 65535) {
      setFormError("Enter a valid SMTP host and port (1–65535).");
      return;
    }
    if (!form.username.trim()) {
      setFormError("SMTP username is required.");
      return;
    }
    if (!editingId && !form.password) {
      setFormError("SMTP password is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          host: form.host.trim(),
          port,
          username: form.username.trim(),
          encryption: form.encryption,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/smtp-configs/${editingId}`, {
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
          setFormError(data.error ?? "Create failed");
          return;
        }
      }
      await load();
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setFormError(null);
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this SMTP configuration?")) return;
    try {
      const res = await fetch(`/api/smtp-configs/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="min-w-0 space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 to-blue-700 shadow-[0_0_12px_rgba(59,130,246,0.5)] sm:h-7" />
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            SMTP configuration
          </h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-blue-600/50 bg-blue-600/20 px-4 py-2.5 text-sm font-medium text-blue-100 transition hover:bg-blue-600/30"
        >
          Add configuration
        </button>
      </div>

      <div className="app-card p-4 sm:p-6">
        {loading && (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
        {loadError && (
          <p className="text-sm text-red-300">{loadError}</p>
        )}
        {!loading && !loadError && configs.length === 0 && (
          <p className="text-sm leading-relaxed text-slate-400">
            No saved SMTP settings yet. Add host, port, username, password, and encryption below, or
            use{" "}
            <code className="rounded bg-blue-950/80 px-1 py-0.5 text-xs text-blue-200/90">
              SMTP_* in .env
            </code>
            .
          </p>
        )}
        {!loading && !loadError && configs.length > 0 && (
          <ul className="space-y-3">
            {configs.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-blue-900/45 bg-blue-950/25 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-sm font-medium text-slate-100">
                    {c.host}:{c.port}
                  </p>
                  <p className="font-mono text-xs text-slate-400">
                    {c.encryption.toUpperCase()} · {c.username}
                    {c.passwordSet ? "" : " · no password stored"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="rounded-lg border border-blue-700/50 bg-blue-950/50 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-900/50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smtp-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={closeModal}
          />
          <div
            className="relative z-10 flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-blue-900/50 bg-[#0a1628] shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-blue-900/40 px-4 py-4 sm:px-6">
              <h3 id="smtp-modal-title" className="text-lg font-semibold text-white">
                {editingId ? "Edit SMTP" : "Add SMTP"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-950/60 hover:text-white"
                aria-label="Close dialog"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={submitModal} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
              <div className="space-y-4 pb-4">
                <label className="block space-y-1.5">
                  <span className={labelClass}>SMTP host</span>
                  <input
                    required
                    value={form.host}
                    onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                    placeholder="smtp.example.com"
                    className={inputClass}
                    autoComplete="off"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>SMTP port</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                    className={inputClass}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>SMTP username</span>
                  <input
                    required
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="username@example.com"
                    className={inputClass}
                    autoComplete="username"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>SMTP password</span>
                  <div className="relative">
                    <input
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        editingId
                          ? "Leave blank to keep current password"
                          : "••••••••"
                      }
                      className={`${inputClass} pr-11`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:bg-blue-950/60 hover:text-slate-200"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>Encryption</span>
                  <select
                    value={form.encryption}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        encryption: e.target.value as FormState["encryption"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="tls">TLS (STARTTLS)</option>
                    <option value="ssl">SSL (port 465)</option>
                    <option value="none">None (not recommended)</option>
                  </select>
                </label>

                {formError && (
                  <div className="rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-100">
                    {formError}
                  </div>
                )}
              </div>

              <div className="mt-auto flex flex-col-reverse gap-2 border-t border-blue-900/40 bg-[#080f18]/90 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-slate-600/60 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
                >
                  {saving ? "Saving…" : editingId ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
