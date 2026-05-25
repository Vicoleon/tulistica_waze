const isProduction = process.env.NODE_ENV === "production";

function requireInProd(name: string, value: string | undefined, fallback = ""): string {
  if (!value) {
    if (isProduction) {
      throw new Error(
        `[env] Missing required environment variable: ${name}. ` +
        `Set it before starting the server in production.`
      );
    }
    return fallback;
  }
  return value;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: requireInProd("JWT_SECRET", process.env.JWT_SECRET, "dev-only-insecure-secret-do-not-use-in-prod"),
  databaseUrl: requireInProd("DATABASE_URL", process.env.DATABASE_URL),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  mockAuth: process.env.MOCK_AUTH === "true",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  paymentProvider: process.env.PAYMENT_PROVIDER ?? "stub", // "stripe" | "stub"
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  port: parseInt(process.env.PORT ?? "3000", 10),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
};

if (isProduction && ENV.cookieSecret.length < 32) {
  throw new Error(
    "[env] JWT_SECRET must be at least 32 characters in production. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\""
  );
}
