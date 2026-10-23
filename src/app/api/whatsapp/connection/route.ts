import { NextResponse } from "next/server";
import { getConnection, saveConnection } from "@/lib/whatsapp/store";

export const runtime = "nodejs";

export async function GET() {
  const connection = await getConnection();
  return NextResponse.json({ connection });
}

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
  const templateLanguage =
    typeof body.templateLanguage === "string" ? body.templateLanguage.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";

  if (!/^\d+$/.test(phoneNumberId)) {
    return NextResponse.json({ error: "Phone number ID must be digits." }, { status: 400 });
  }
  if (!templateName) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(templateLanguage)) {
    return NextResponse.json(
      { error: "Template language should look like en or en_US." },
      { status: 400 },
    );
  }

  try {
    await saveConnection({
      phoneNumberId,
      accessToken,
      templateName,
      templateLanguage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ connection: await getConnection() });
}
