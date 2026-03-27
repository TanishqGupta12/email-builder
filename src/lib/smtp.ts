import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  getActiveSmtpConfigForSend,
  type SmtpConfigRecord,
} from "@/lib/smtp-config-store";

export function transportOptionsFromRecord(
  c: SmtpConfigRecord,
): SMTPTransport.Options {
  const secure = c.encryption === "ssl";
  const opts: SMTPTransport.Options = {
    host: c.host,
    port: c.port,
    secure,
    auth: { user: c.username, pass: c.password },
  };
  if (c.encryption === "tls") {
    opts.requireTLS = true;
  }
  if (c.encryption === "none") {
    opts.ignoreTLS = true;
  }
  return opts;
}

function transporterFromEnv() {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "No active SMTP configuration with credentials. Add one under SMTP configuration, or set SMTP_USER and SMTP_PASS in .env (use a Gmail App Password if 2FA is enabled).",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export function getTransporter() {
  const fromStore = getActiveSmtpConfigForSend();
  if (
    fromStore &&
    fromStore.username &&
    fromStore.password &&
    fromStore.active
  ) {
    return nodemailer.createTransport(transportOptionsFromRecord(fromStore));
  }

  return transporterFromEnv();
}
