import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { BRAND_COOKIE_NAME, ONE_YEAR_MS, ONE_HOUR_MS } from "@shared/const";
import { ENV } from "../_core/env";
import { notifyOwner } from "../_core/notification";
import type { Brand } from "../../drizzle/schema";

const SCRYPT_KEY_LEN = 64;
const PASSWORD_MIN_LEN = 8;

export type BrandSessionPayload = {
  brandId: number;
  email: string;
};

function getSecretKey(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) {
    throw new Error("cookieSecret is not configured");
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(plain: string): { hash: string; salt: string } {
  if (typeof plain !== "string" || plain.length < PASSWORD_MIN_LEN) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LEN} characters`);
  }
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, SCRYPT_KEY_LEN);
  return { hash: derived.toString("hex"), salt };
}

export function verifyPassword(plain: string, salt: string, expectedHash: string): boolean {
  if (!plain || !salt || !expectedHash) return false;
  try {
    const derived = scryptSync(plain, salt, SCRYPT_KEY_LEN);
    const expected = Buffer.from(expectedHash, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateToken(byteLen = 32): string {
  return randomBytes(byteLen).toString("hex");
}

export async function signBrandSession(
  payload: BrandSessionPayload,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ brandId: payload.brandId, email: payload.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

export async function verifyBrandSession(
  cookieValue: string | undefined | null
): Promise<BrandSessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const brandId = payload.brandId;
    const email = payload.email;
    if (typeof brandId !== "number" || typeof email !== "string") return null;
    return { brandId, email };
  } catch {
    return null;
  }
}

export function getBrandCookieFromRequest(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const parsed = parseCookieHeader(cookieHeader);
  return parsed[BRAND_COOKIE_NAME];
}

export async function getBrandSessionFromRequest(req: Request): Promise<BrandSessionPayload | null> {
  return verifyBrandSession(getBrandCookieFromRequest(req));
}

export function tokenExpiry(kind: "email_verify" | "password_reset"): Date {
  if (kind === "email_verify") {
    return new Date(Date.now() + ONE_YEAR_MS); // generous: 1 year
  }
  return new Date(Date.now() + ONE_HOUR_MS); // password resets expire fast
}

/**
 * Dispatch a brand-facing email. In production this should hit SMTP / SendGrid.
 * For MVP we log + notify the owner so the team can manually relay during onboarding.
 */
export async function sendBrandEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ delivered: boolean }> {
  const preview = `[BrandEmail] to=${opts.to} subject="${opts.subject}"\n${opts.body}`;
  console.log(preview);
  try {
    await notifyOwner({
      title: `[Tulistica] ${opts.subject}`,
      content: `Brand: ${opts.to}\n\n${opts.body}`,
    });
    return { delivered: true };
  } catch (error) {
    console.warn("[BrandEmail] notifyOwner failed", error);
    return { delivered: false };
  }
}

export function buildBrandActionUrl(
  baseUrl: string,
  path: "verify-email" | "reset-password",
  token: string
): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/brand/${path}?token=${encodeURIComponent(token)}`;
}

export function safePublicBrand(brand: Brand) {
  const { passwordHash, passwordSalt, ...rest } = brand;
  return rest;
}
