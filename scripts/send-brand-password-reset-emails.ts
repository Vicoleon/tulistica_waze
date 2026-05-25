#!/usr/bin/env tsx
/**
 * One-off operator script. Run AFTER migration 0010 has been applied.
 *
 *   pnpm tsx scripts/send-brand-password-reset-emails.ts
 *
 * Iterates users that were synthesized by the migration (loginMethod =
 * 'brand-migration' AND passwordHash IS NULL) and sends each one a password
 * reset link via the standard user-auth flow.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, createUserToken } from "../server/db";
import { users } from "../drizzle/schema";
import {
  generateUserToken,
  userTokenExpiry,
  buildUserActionUrl,
  sendUserEmail,
} from "../server/services/userAuth";
import { ENV } from "../server/_core/env";

function appBaseUrl(): string {
  return (ENV as any).appBaseUrl ?? "http://localhost:3000";
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const candidates = await db
    .select()
    .from(users)
    .where(and(eq(users.loginMethod, "brand-migration"), isNull(users.passwordHash)));

  console.log(`Found ${candidates.length} migrated brand users without a password.`);

  for (const u of candidates) {
    if (!u.email) {
      console.warn(`  user id=${u.id} has no email — skipping`);
      continue;
    }
    const token = generateUserToken();
    await createUserToken({
      userId: u.id,
      token,
      type: "password_reset",
      expiresAt: userTokenExpiry("password_reset"),
    });
    const url = buildUserActionUrl(appBaseUrl(), "reset-password", token);
    const result = await sendUserEmail({
      to: u.email,
      subject: "Set your Tulistica password",
      body: `Hola ${u.name ?? ""},\n\nTu cuenta de marca fue migrada al nuevo sistema. Configurá tu contraseña abriendo este enlace (válido 30 minutos):\n${url}\n\nDespués de configurarla podés iniciar sesión en /sign-in.`,
    });
    console.log(`  sent to ${u.email} — delivered=${result.delivered}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
