import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { ENV } from "./env";

const credentialsSchema = z.object({
  email: z.string().email("Email inválido").max(320),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(200),
  name: z.string().min(1).max(120).optional(),
});

const BCRYPT_ROUNDS = 12;

function openIdForEmail(email: string): string {
  // Stable per-email synthetic openId so OAuth and local-auth flows coexist.
  return `local:${email.toLowerCase()}`;
}

async function findByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
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

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Datos inválidos");
    }

    const db = await getDb();
    if (!db) return badRequest(res, "Servicio no disponible", 503);

    const email = parsed.data.email.toLowerCase();
    const existing = await findByEmail(email);
    if (existing && existing.passwordHash) {
      return badRequest(res, "Ese correo ya está registrado", 409);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
    const name = parsed.data.name?.trim() || email.split("@")[0];
    const openId = openIdForEmail(email);

    if (existing) {
      await db
        .update(users)
        .set({
          passwordHash,
          name,
          loginMethod: "local",
          lastSignedIn: new Date(),
        })
        .where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({
        openId,
        email,
        name,
        passwordHash,
        loginMethod: "local",
        lastSignedIn: new Date(),
        role: ENV.ownerOpenId === openId ? "super_admin" : "consumer",
      });
    }

    await issueSession(req, res, openId, name);
    res.json({ ok: true });
  });

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

    const db = await getDb();
    if (db) {
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
    }

    await issueSession(req, res, user.openId, user.name ?? user.email ?? "Usuario");
    res.json({ ok: true });
  });
}
