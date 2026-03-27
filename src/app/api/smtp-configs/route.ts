import { NextResponse } from "next/server";
import {
  createSmtpConfig,
  listSmtpConfigs,
  type SmtpEncryption,
} from "@/lib/smtp-config-store";

const ENCRYPTIONS: SmtpEncryption[] = ["tls", "ssl", "none"];

function parseEncryption(v: unknown): SmtpEncryption | null {
  if (typeof v !== "string") return null;
  return ENCRYPTIONS.includes(v as SmtpEncryption) ? (v as SmtpEncryption) : null;
}

export async function GET() {
  return NextResponse.json({ configs: listSmtpConfigs() });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const host = typeof body.host === "string" ? body.host.trim() : "";
  const port = Number(body.port);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const encryption = parseEncryption(body.encryption);

  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return NextResponse.json(
      { error: "Host and a valid port (1–65535) are required." },
      { status: 400 },
    );
  }
  if (!username) {
    return NextResponse.json({ error: "SMTP username is required." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "SMTP password is required." }, { status: 400 });
  }
  if (!encryption) {
    return NextResponse.json({ error: "Encryption must be tls, ssl, or none." }, { status: 400 });
  }

  const rec = createSmtpConfig({
    name: host,
    host,
    port,
    username,
    password,
    encryption,
    active: true,
    isDefault: true,
  });

  const { password: _, ...safe } = rec;
  return NextResponse.json({
    config: { ...safe, passwordSet: true },
  });
}
