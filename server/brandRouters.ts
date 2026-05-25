import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { setActiveBrandCookie } from "./_core/cookies";
import {
  brandVerifiedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { safePublicBrand } from "./services/brandAuth";

export const brandAuthRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { brand: null, memberships: [] };
    const memberships = await db.getAllMembershipsForUser(ctx.user.id);
    return {
      brand: ctx.brand ? safePublicBrand(ctx.brand) : null,
      memberships: memberships.map(m => ({
        brand: safePublicBrand(m.brand),
        membershipRole: m.membershipRole,
      })),
    };
  }),

  register: protectedProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255),
      contactName: z.string().trim().max(255).optional(),
      country: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Soft guardrail: don't let the same user create two brands with the
      // same companyName (typo / double-click protection).
      const existing = await db.getAllMembershipsForUser(ctx.user.id);
      if (existing.some(m =>
        m.brand.companyName.toLowerCase() === input.companyName.toLowerCase()
        && m.membershipRole === "owner"
      )) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already own a brand with that name",
        });
      }
      const brandId = await db.createBrand({
        companyName: input.companyName,
        email: ctx.user.email ?? `unknown+${ctx.user.id}@tulistica.local`,
        // Legacy NOT NULL columns. Cleanup migration drops them later.
        passwordHash: "",
        passwordSalt: "",
        emailVerified: true,
        contactName: input.contactName,
        country: input.country,
        status: "active",
        kind: "advertiser",
      });
      if (!brandId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create brand" });
      }
      await db.createBrandMember({
        brandId,
        userId: ctx.user.id,
        membershipRole: "owner",
        acceptedAt: new Date(),
      });
      setActiveBrandCookie(ctx.res, ctx.req, brandId);
      const brand = await db.getBrandById(brandId);
      return { brand: brand ? safePublicBrand(brand) : null };
    }),

  switchActiveBrand: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const memberships = await db.getAllMembershipsForUser(ctx.user.id);
      const match = memberships.find(m => m.brand.id === input.brandId);
      if (!match) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No membership in that brand" });
      }
      setActiveBrandCookie(ctx.res, ctx.req, input.brandId);
      return { brand: safePublicBrand(match.brand) };
    }),

  updateProfile: brandVerifiedProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255).optional(),
      contactName: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(32).optional(),
      country: z.string().trim().max(64).optional(),
      billingEmail: z.string().email().optional(),
      taxId: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.updateBrand(ctx.brand.id, input);
      const updated = await db.getBrandById(ctx.brand.id);
      return { brand: updated ? safePublicBrand(updated) : null };
    }),

  uploadLogo: brandVerifiedProcedure
    .input(z.object({
      contentType: z.string().regex(/^image\//),
      base64Data: z.string().max(8 * 1024 * 1024),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const key = `brand-logos/${ctx.brand.id}-${Date.now()}`;
      const result = await storagePut(key, buffer, input.contentType);
      await db.updateBrand(ctx.brand.id, { logoUrl: result.url });
      return { logoUrl: result.url };
    }),
});
