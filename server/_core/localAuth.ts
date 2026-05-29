import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getDb } from "../db";
import * as db from "../db";
import { users } from "../../drizzle/schema";
import { ENV } from "./env";
import {
  buildUserActionUrl,
  generateUserToken,
  sendUserEmail,
  userTokenExpiry,
  USER_RESEND_COOLDOWN_MS,
} from "../services/userAuth";

const credentialsSchema = z.object({
  email: z.string().email("Email inválido").max(320),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(200),
  name: z.string().min(1).max(120).optional(),
});

const tokenInputSchema = z.object({
  token: z.string().min(16).max(256),
});

const resetInputSchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: z.string().min(8).max(200),
});

const emailOnlySchema = z.object({
  email: z.string().email().max(320),
});

const BCRYPT_ROUNDS = 12;
const lastResendAt = new Map<number, number>();

function openIdForEmail(email: string): string {
  return `local:${email.toLowerCase()}`;
}

async function findByEmail(email: string) {
  const d = await getDb();
  if (!d) return null;
  const rows = await d
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

async function issueSession(req: Request, res: Response, openId: string, name: string) {
  const token = await sdk.createSessionToken(openId, {
    name,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

function badRequest(res: Response, message: string, code = 400) {
  res.status(code).json({ error: message });
}

function appBaseUrl(): string {
  // ENV may or may not expose appBaseUrl depending on env.ts surface.
  // Falls back to localhost for dev.
  return (ENV as any).appBaseUrl ?? "http://localhost:3000";
}

async function sendVerificationEmail(userId: number, email: string, name: string) {
  await db.invalidateUserTokensOfType(userId, "email_verify");
  const token = generateUserToken();
  await db.createUserToken({
    userId,
    token,
    type: "email_verify",
    expiresAt: userTokenExpiry("email_verify"),
  });
  const url = buildUserActionUrl(appBaseUrl(), "verify-email", token);
  await sendUserEmail({
    to: email,
    subject: "Verificá tu correo en Tulistica",
    body: `Hola ${name},\n\nConfirmá tu correo abriendo este enlace:\n${url}\n\nEl enlace vence en 24 horas.`,
  });
}

export function registerLocalAuthRoutes(app: Express) {
  // ===== SIGN UP =====
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Datos inválidos");
    }

    const d = await getDb();
    if (!d) return badRequest(res, "Servicio no disponible", 503);

    const email = parsed.data.email.toLowerCase();
    const existing = await findByEmail(email);
    if (existing && existing.passwordHash) {
      return badRequest(res, "Ese correo ya está registrado", 409);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
    const name = parsed.data.name?.trim() || email.split("@")[0];
    const openId = openIdForEmail(email);

    let userId: number | null = null;
    if (existing) {
      await d
        .update(users)
        .set({
          passwordHash,
          name,
          loginMethod: "local",
          lastSignedIn: new Date(),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const result = await d.insert(users).values({
        openId,
        email,
        name,
        passwordHash,
        loginMethod: "local",
        lastSignedIn: new Date(),
        role: ENV.ownerOpenId === openId ? "super_admin" : "consumer",
        // Auto-verify while we have no SMTP/email service wired up. When
        // email delivery exists, flip this back to `false` and re-enable
        // the gate in server/_core/trpc.ts (verifiedProcedure).
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });
      userId = (result as any)[0]?.insertId ?? null;
    }

    // Verification-email send is intentionally skipped — see note above.

    await issueSession(req, res, openId, name);
    res.json({ ok: true });
  });

  // ===== SIGN IN =====
  app.post("/api/auth/signin", async (req, res) => {
    const parsed = credentialsSchema
      .pick({ email: true, password: true })
      .safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Datos inválidos");
    }

    const user = await findByEmail(parsed.data.email);
    if (!user || !user.passwordHash) {
      return badRequest(res, "Credenciales inválidas", 401);
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return badRequest(res, "Credenciales inválidas", 401);

    const d = await getDb();
    if (d) {
      await d.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    }

    await issueSession(req, res, user.openId, user.name ?? user.email ?? "Usuario");
    res.json({ ok: true });
  });

  // ===== VERIFY EMAIL =====
  app.post("/api/auth/verify-email", async (req, res) => {
    const parsed = tokenInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, "Token inválido");
    const consumed = await db.consumeUserToken(parsed.data.token, "email_verify");
    if (!consumed) return badRequest(res, "Token inválido o expirado");
    await db.markUserEmailVerified(consumed.userId);
    res.json({ ok: true });
  });

  // ===== RESEND VERIFICATION =====
  app.post("/api/auth/resend-verification", async (req, res) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) return badRequest(res, "No autorizado", 401);
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });

    const last = lastResendAt.get(user.id) ?? 0;
    if (Date.now() - last < USER_RESEND_COOLDOWN_MS) {
      return badRequest(res, "Esperá unos segundos antes de pedir otro correo", 429);
    }
    lastResendAt.set(user.id, Date.now());

    await sendVerificationEmail(user.id, user.email ?? "", user.name ?? "Usuario");
    res.json({ ok: true });
  });

  // ===== FORGOT PASSWORD =====
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      // Still 200 — do not leak parse errors
      return res.json({ ok: true });
    }
    const user = await findByEmail(parsed.data.email);
    if (!user || !user.passwordHash) {
      // No enumeration: always return 200.
      return res.json({ ok: true });
    }
    await db.invalidateUserTokensOfType(user.id, "password_reset");
    const token = generateUserToken();
    await db.createUserToken({
      userId: user.id,
      token,
      type: "password_reset",
      expiresAt: userTokenExpiry("password_reset"),
    });
    const url = buildUserActionUrl(appBaseUrl(), "reset-password", token);
    await sendUserEmail({
      to: user.email ?? parsed.data.email,
      subject: "Restablecé tu contraseña en Tulistica",
      body: `Abrí este enlace (válido 30 minutos):\n${url}`,
    });
    res.json({ ok: true });
  });

  // ===== RESET PASSWORD =====
  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = resetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, "Datos inválidos");
    }
    const consumed = await db.consumeUserToken(parsed.data.token, "password_reset");
    if (!consumed) return badRequest(res, "Token inválido o expirado");
    const hash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
    await db.setUserPasswordHash(consumed.userId, hash);
    res.json({ ok: true });
  });
}
