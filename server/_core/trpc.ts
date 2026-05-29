import {
  BRAND_UNAUTHED_ERR_MSG,
  EMAIL_NOT_VERIFIED_ERR_MSG,
  NOT_ADMIN_ERR_MSG,
  NOT_VENDOR_ADMIN_ERR_MSG,
  NOT_VENDOR_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import * as db from "../db";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

// NOTE: email-verified gating is temporarily disabled — no SMTP/email service
// is wired up in dev, so requiring verification blocks every authed action.
// Re-add the `!ctx.user.emailVerified` check here once email delivery exists.
export const verifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// Backwards-compat alias used by existing admin.* routes.
// Remove after callers are migrated (cleanup PR).
export const adminProcedure = superAdminProcedure;

export const vendorStaffProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    if (memberships.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_VENDOR_ERR_MSG });
    }
    return next({
      ctx: { ...ctx, user: ctx.user, vendorMemberships: memberships },
    });
  }),
);

export const vendorAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    const adminMemberships = memberships.filter(
      m => m.membershipRole === "owner" || m.membershipRole === "admin",
    );
    if (adminMemberships.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_VENDOR_ADMIN_ERR_MSG });
    }
    return next({
      ctx: { ...ctx, user: ctx.user, vendorMemberships: adminMemberships },
    });
  }),
);

// Brand-cookie auth — unchanged in this spec. Rebuilt in Phase 3 (future spec).
const requireBrand = t.middleware(async ({ ctx, next }) => {
  if (!ctx.brand) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: BRAND_UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, brand: ctx.brand } });
});

export const brandProcedure = t.procedure.use(requireBrand);

// NOTE: email-verified gating disabled — see verifiedProcedure above.
export const brandVerifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.brand) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: BRAND_UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user, brand: ctx.brand } });
  }),
);
