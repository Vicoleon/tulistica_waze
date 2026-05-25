import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

const DEV_USER = {
  openId: "dev_local_user",
  name: "Usuario de prueba",
  email: "dev@grocerywaze.local",
  loginMethod: "dev",
};

function isEnabled(): boolean {
  return !ENV.isProduction && process.env.MOCK_AUTH === "true";
}

async function signIn(res: Response, req: Request) {
  await db.upsertUser({
    openId: DEV_USER.openId,
    name: DEV_USER.name,
    email: DEV_USER.email,
    loginMethod: DEV_USER.loginMethod,
    lastSignedIn: new Date(),
  });

  const sessionToken = await sdk.createSessionToken(DEV_USER.openId, {
    name: DEV_USER.name,
    expiresInMs: ONE_YEAR_MS,
  });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function registerDevAuthRoutes(app: Express) {
  if (!isEnabled()) return;

  console.log(
    "[devAuth] MOCK_AUTH enabled — /api/dev/login is active. Disable by removing MOCK_AUTH=true."
  );

  app.get("/api/dev/login", async (req: Request, res: Response) => {
    try {
      await signIn(res, req);
      res.redirect(302, "/dashboard");
    } catch (error) {
      console.error("[devAuth] Sign-in failed:", error);
      res.status(500).json({ error: "Dev sign-in failed" });
    }
  });

  app.post("/api/dev/login", async (req: Request, res: Response) => {
    try {
      await signIn(res, req);
      res.json({ ok: true, user: DEV_USER });
    } catch (error) {
      console.error("[devAuth] Sign-in failed:", error);
      res.status(500).json({ error: "Dev sign-in failed" });
    }
  });
}

export const devAuthEnabled = isEnabled;
