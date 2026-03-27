import { NextResponse } from "next/server";
import {
  deleteSmtpConfig,
  getSmtpConfig,
  updateSmtpConfig,
  type SmtpEncryption,
} from "@/lib/smtp-config-store";

const ENCRYPTIONS: SmtpEncryption[] = ["tls", "ssl", "none"];

function parseEncryption(v: unknown): SmtpEncryption | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return null;
  return ENCRYPTIONS.includes(v as SmtpEncryption) ? (v as SmtpEncryption) : null;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const c = getSmtpConfig(id);
  if (!c) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { password, ...rest } = c;
  return NextResponse.json({
    config: { ...rest, passwordSet: password.length > 0 },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const existing = getSmtpConfig(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof updateSmtpConfig>[1] = {};

  if (body.host !== undefined) {
    const h =
      typeof body.host === "string" ? body.host.trim() : existing.host.trim();
    if (!h) {
      return NextResponse.json({ error: "SMTP host is required." }, { status: 400 });
    }
    patch.host = h;
    patch.name = h;
  }
  if (body.port !== undefined) {
    const port = Number(body.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: "Invalid port" }, { status: 400 });
    }
    patch.port = port;
  }
  if (body.username !== undefined) {
    patch.username =
      typeof body.username === "string" ? body.username : existing.username;
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    patch.password = body.password;
  }
  if (body.clearPassword === true) {
    patch.clearPassword = true;
  }
  if (body.encryption !== undefined) {
    const enc = parseEncryption(body.encryption);
    if (enc === null || enc === undefined) {
      return NextResponse.json({ error: "Invalid encryption" }, { status: 400 });
    }
    patch.encryption = enc;
  }

  const updated = updateSmtpConfig(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { password, ...safe } = updated;
  return NextResponse.json({
    config: { ...safe, passwordSet: password.length > 0 },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const ok = deleteSmtpConfig(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
