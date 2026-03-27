import { NextResponse } from "next/server";
import { envMessageToHtml } from "@/lib/env-message-html";

export async function GET() {
  const messageRaw = process.env.MESSAGE;
  console.log("messageRaw", messageRaw);
  const defaultMessageHtml = envMessageToHtml(messageRaw);

  return NextResponse.json({
    defaultSender:
      process.env.DEFAULT_SENDER_EMAIL?.trim() ||
      process.env.SMTP_USER?.trim() ||
      "",
    defaultSubject: process.env.SUBJECT?.trim() ?? "",
    defaultMessageHtml,
  });
}
