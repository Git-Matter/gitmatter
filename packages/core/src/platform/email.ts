// Provider-agnostic email transport. A real provider (Resend / SMTP / SES) is
// wired at deploy time by setting EMAIL_PROVIDER and adding a case below. Until
// then the console transport logs messages (incl. action links) so the
// verification / reset / invite flows are fully testable without a provider.

import { getEnv } from "../core/config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmailTransport implements EmailTransport {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[email] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
  }
}

let cached: EmailTransport | undefined;

/** The active transport. Console when EMAIL_PROVIDER is unset (dev). */
export function emailTransport(): EmailTransport {
  if (cached) return cached;
  const provider = getEnv("EMAIL_PROVIDER")?.trim();
  switch (provider) {
    // case "resend": cached = new ResendTransport(getEnv("RESEND_API_KEY")!); break;
    // case "smtp": cached = new SmtpTransport(/* SMTP_* env */); break;
    default:
      cached = new ConsoleEmailTransport();
  }
  return cached;
}

/** True when a real (non-console) email provider is configured. */
export function emailEnabled(): boolean {
  return Boolean(getEnv("EMAIL_PROVIDER")?.trim());
}

export function sendVerificationEmail(to: string, url: string): Promise<void> {
  return emailTransport().send({
    to,
    subject: "Verify your gitmatter email",
    text: `Confirm your email address by opening this link:\n\n${url}\n\nIf you did not create a gitmatter account, ignore this message.`,
  });
}

export function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  return emailTransport().send({
    to,
    subject: "Reset your gitmatter password",
    text: `Reset your password by opening this link:\n\n${url}\n\nIf you did not request a reset, ignore this message.`,
  });
}

export function sendInviteEmail(to: string, url: string, orgName?: string): Promise<void> {
  const org = orgName ? ` to ${orgName}` : "";
  return emailTransport().send({
    to,
    subject: `You've been invited${org} on gitmatter`,
    text: `You've been invited${org}. Accept the invite by opening this link:\n\n${url}`,
  });
}
