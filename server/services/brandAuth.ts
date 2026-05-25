import type { Brand } from "../../drizzle/schema";

/**
 * Strip sensitive fields from a brand row before returning to the client.
 * The passwordHash / passwordSalt columns are dead-but-present after the
 * brand-cookie deprecation; we still strip them defensively until they
 * are dropped in a future cleanup migration.
 */
export function safePublicBrand(brand: Brand) {
  const { passwordHash, passwordSalt, ...rest } = brand;
  return rest;
}
