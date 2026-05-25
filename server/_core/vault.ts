/**
 * Encrypted credential vault.
 *
 * Uses AES-256-GCM with a key derived from JWT_SECRET via HKDF-SHA256.
 * The IV and auth tag are stored alongside the ciphertext so we can decrypt
 * without re-deriving anything else. Rotating JWT_SECRET intentionally
 * invalidates every stored credential — callers must re-enter them, which
 * is the desired security property when a secret leaks.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { ENV } from "./env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const HKDF_INFO = Buffer.from("grocerywaze:vault:v1");
const HKDF_SALT = Buffer.from("grocerywaze:salt:v1");

interface EncryptedBlob {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(): Buffer {
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 8) {
    throw new Error(
      "[vault] JWT_SECRET must be set to encrypt credentials. " +
      "Set it in .env (>= 32 chars in production)."
    );
  }
  // hkdfSync returns ArrayBuffer; wrap as Buffer for crypto API consumers.
  const ikm = Buffer.from(ENV.cookieSecret, "utf8");
  const okm = hkdfSync("sha256", ikm, HKDF_SALT, HKDF_INFO, KEY_LENGTH);
  return Buffer.from(okm);
}

export function encryptCredential(payload: unknown): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: EncryptedBlob = {
    v: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("hex"),
  };
  return JSON.stringify(blob);
}

export function decryptCredential<T = unknown>(blob: string): T {
  const parsed: EncryptedBlob = JSON.parse(blob);
  if (parsed.v !== 1) {
    throw new Error(`[vault] Unsupported blob version: ${parsed.v}`);
  }
  const key = deriveKey();
  const iv = Buffer.from(parsed.iv, "hex");
  const tag = Buffer.from(parsed.tag, "hex");
  const data = Buffer.from(parsed.data, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
