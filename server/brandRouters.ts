import { BRAND_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";
import {
  brandProcedure,
  brandVerifiedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import {
  buildBrandActionUrl,
  generateToken,
  hashPassword,
  safePublicBrand,
  sendBrandEmail,
  signBrandSession,
  tokenExpiry,
  verifyPassword,
} from "./services/brandAuth";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256, "Password is too long");

const setBrandCookie = async (
  ctx: { req: import("express").Request; res: import("express").Response },
  brandId: number,
  email: string
) => {
  const token = await signBrandSession({ brandId, email });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(BRAND_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS,
  });
};

export const brandAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    return ctx.brand ? safePublicBrand(ctx.brand) : null;
  }),

  register: publicProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255),
      email: emailSchema,
      password: passwordSchema,
      contactName: z.string().trim().max(255).optional(),
      country: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getBrandByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists",
        });
      }

      const { hash, salt } = hashPassword(input.password);
      const brandId = await db.createBrand({
        companyName: input.companyName,
        email: input.email,
        passwordHash: hash,
        passwordSalt: salt,
        contactName: input.contactName,
        country: input.country,
        emailVerified: false,
        status: "pending",
      });

      if (!brandId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create brand account",
        });
      }

      const token = generateToken();
      await db.createBrandToken({
        brandId,
        token,
        type: "email_verify",
        expiresAt: tokenExpiry("email_verify"),
      });

      const verifyUrl = buildBrandActionUrl(ENV.appBaseUrl, "verify-email", token);
      await sendBrandEmail({
        to: input.email,
        subject: "Verify your Tulistica brand account",
        body: `Welcome ${input.companyName}!\n\nConfirm your email by opening:\n${verifyUrl}`,
      });

      await setBrandCookie(ctx, brandId, input.email);
      const brand = await db.getBrandById(brandId);
      return { brand: brand ? safePublicBrand(brand) : null, verifyUrl };
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const brand = await db.getBrandByEmail(input.email);
      if (!brand) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (brand.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }

      const ok = verifyPassword(input.password, brand.passwordSalt, brand.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      await setBrandCookie(ctx, brand.id, brand.email);
      await db.recordBrandSignIn(brand.id);

      return { brand: safePublicBrand(brand) };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(BRAND_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  resendVerification: brandProcedure.mutation(async ({ ctx }) => {
    if (ctx.brand.emailVerified) {
      return { sent: false, alreadyVerified: true };
    }
    await db.invalidateBrandTokensOfType(ctx.brand.id, "email_verify");
    const token = generateToken();
    await db.createBrandToken({
      brandId: ctx.brand.id,
      token,
      type: "email_verify",
      expiresAt: tokenExpiry("email_verify"),
    });
    const verifyUrl = buildBrandActionUrl(ENV.appBaseUrl, "verify-email", token);
    await sendBrandEmail({
      to: ctx.brand.email,
      subject: "Verify your Tulistica brand account",
      body: `Open this link to confirm your email:\n${verifyUrl}`,
    });
    return { sent: true, verifyUrl };
  }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const record = await db.getBrandToken(input.token);
      if (!record || record.type !== "email_verify") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid token" });
      }
      if (record.usedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token already used" });
      }
      if (record.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token expired" });
      }
      await db.markBrandTokenUsed(record.id);
      await db.markBrandVerified(record.brandId);
      return { success: true };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ input }) => {
      const brand = await db.getBrandByEmail(input.email);
      // Always pretend success to avoid leaking which emails are registered
      if (!brand) return { sent: true };

      await db.invalidateBrandTokensOfType(brand.id, "password_reset");
      const token = generateToken();
      await db.createBrandToken({
        brandId: brand.id,
        token,
        type: "password_reset",
        expiresAt: tokenExpiry("password_reset"),
      });
      const resetUrl = buildBrandActionUrl(ENV.appBaseUrl, "reset-password", token);
      await sendBrandEmail({
        to: brand.email,
        subject: "Reset your Tulistica brand password",
        body: `Open this link to reset your password (valid for 1 hour):\n${resetUrl}`,
      });
      return { sent: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(8), newPassword: passwordSchema }))
    .mutation(async ({ input }) => {
      const record = await db.getBrandToken(input.token);
      if (!record || record.type !== "password_reset") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid token" });
      }
      if (record.usedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token already used" });
      }
      if (record.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token expired" });
      }
      const { hash, salt } = hashPassword(input.newPassword);
      await db.updateBrand(record.brandId, { passwordHash: hash, passwordSalt: salt });
      await db.markBrandTokenUsed(record.id);
      return { success: true };
    }),

  updateProfile: brandProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255).optional(),
      contactName: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(32).optional(),
      country: z.string().trim().max(64).optional(),
      logoUrl: z.string().url().max(2048).optional(),
      billingEmail: emailSchema.optional(),
      taxId: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.updateBrand(ctx.brand.id, input);
      const fresh = await db.getBrandById(ctx.brand.id);
      return fresh ? safePublicBrand(fresh) : null;
    }),

  changePassword: brandVerifiedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const ok = verifyPassword(input.currentPassword, ctx.brand.passwordSalt, ctx.brand.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }
      const { hash, salt } = hashPassword(input.newPassword);
      await db.updateBrand(ctx.brand.id, { passwordHash: hash, passwordSalt: salt });
      return { success: true };
    }),

  uploadLogo: brandVerifiedProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      contentType: z.string().regex(/^image\/(png|jpeg|jpg|webp|gif)$/i),
      base64Data: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const key = `brands/${ctx.brand.id}/logo-${Date.now()}-${input.filename}`;
      const result = await storagePut(key, buffer, input.contentType);
      await db.updateBrand(ctx.brand.id, { logoUrl: result.url });
      return { url: result.url, key: result.key };
    }),
});
