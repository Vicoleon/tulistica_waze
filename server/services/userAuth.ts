import { randomBytes } from "node:crypto";
import { ONE_HOUR_MS } from "@shared/const";
import { notifyOwner } from "../_core/notification";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export type UserTokenType = "email_verify" | "password_reset";
export type UserActionPath = "verify-email" | "reset-password" | "forgot-password";

export function generateUserToken(byteLen = 32): string {
  return randomBytes(byteLen).toString("hex");
}

export function userTokenExpiry(kind: UserTokenType): Date {
  if (kind === "email_verify") {
    return new Date(Date.now() + TWENTY_FOUR_HOURS_MS);
  }
  return new Date(Date.now() + THIRTY_MINUTES_MS);
}

export function buildUserActionUrl(
  baseUrl: string,
  path: UserActionPath,
  token: string
): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Dispatch a user-facing email. Mirrors sendBrandEmail — logs the body and
 * notifies the platform owner so they can manually relay during MVP/dev.
 * Production wiring (SMTP/SendGrid) is a separate infra task.
 */
export async function sendUserEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ delivered: boolean }> {
  console.log(`[UserEmail] to=${opts.to} subject="${opts.subject}"\n${opts.body}`);
  try {
    await notifyOwner({
      title: `[Tulistica] ${opts.subject}`,
      content: `User: ${opts.to}\n\n${opts.body}`,
    });
    return { delivered: true };
  } catch (error) {
    console.warn("[UserEmail] notifyOwner failed", error);
    return { delivered: false };
  }
}

export const USER_RESEND_COOLDOWN_MS = RESEND_COOLDOWN_MS;
export { ONE_HOUR_MS };
