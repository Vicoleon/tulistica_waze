import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { brandVerifiedProcedure, router } from "./_core/trpc";

const campaignTypeSchema = z.enum(["sponsored_search", "banner", "cart_suggestion"]);
const campaignStatusSchema = z.enum(["draft", "active", "paused", "ended"]);

const campaignInputBase = z.object({
  name: z.string().trim().min(2).max(255),
  productId: z.number().int().positive().optional(),
  type: campaignTypeSchema,
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  targetUrl: z.string().url().max(2048).optional(),
  bidCpc: z.number().min(0).max(1000).optional(),
  dailyBudgetCents: z.number().int().min(0).max(100_000_00).optional(),
  targetKeywords: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  targetCategories: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  triggerCategories: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  targetCities: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  activeFrom: z.date().optional(),
  activeUntil: z.date().optional(),
  status: campaignStatusSchema.optional(),
});

function ensureOwnership<T extends { brandId: number | null }>(
  brandId: number,
  campaign: T | undefined
): asserts campaign is T {
  if (!campaign || campaign.brandId !== brandId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
}

function isoDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const brandCampaignsRouter = router({
  list: brandVerifiedProcedure.query(async ({ ctx }) => {
    const campaigns = await db.listCampaignsForBrand(ctx.brand.id);
    return campaigns.map(c => ({
      ...c,
      ctr: c.impressions && c.impressions > 0
        ? Number((((c.clicks ?? 0) / c.impressions) * 100).toFixed(2))
        : 0,
    }));
  }),

  get: brandVerifiedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const campaign = await db.getCampaignForBrand(ctx.brand.id, input.id);
      ensureOwnership(ctx.brand.id, campaign);
      return campaign;
    }),

  create: brandVerifiedProcedure
    .input(campaignInputBase)
    .mutation(async ({ ctx, input }) => {
      const id = await db.createCampaign({
        ...input,
        brandId: ctx.brand.id,
        status: input.status ?? "draft",
        isActive: (input.status ?? "draft") === "active",
      });
      if (!id) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create campaign",
        });
      }
      const created = await db.getCampaignForBrand(ctx.brand.id, id);
      return created;
    }),

  update: brandVerifiedProcedure
    .input(z.object({ id: z.number().int().positive() }).and(campaignInputBase.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const existing = await db.getCampaignForBrand(ctx.brand.id, id);
      ensureOwnership(ctx.brand.id, existing);

      const nextStatus = patch.status ?? existing.status;
      await db.updateCampaignForBrand(ctx.brand.id, id, {
        ...patch,
        isActive: nextStatus === "active",
      });
      const updated = await db.getCampaignForBrand(ctx.brand.id, id);
      return updated;
    }),

  setStatus: brandVerifiedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: campaignStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignForBrand(ctx.brand.id, input.id);
      ensureOwnership(ctx.brand.id, existing);
      await db.updateCampaignForBrand(ctx.brand.id, input.id, {
        status: input.status,
        isActive: input.status === "active",
      });
      return { success: true, status: input.status };
    }),

  delete: brandVerifiedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignForBrand(ctx.brand.id, input.id);
      ensureOwnership(ctx.brand.id, existing);
      await db.deleteCampaignForBrand(ctx.brand.id, input.id);
      return { success: true };
    }),

  uploadCreative: brandVerifiedProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      filename: z.string().min(1).max(255),
      contentType: z.string().regex(/^image\/(png|jpeg|jpg|webp|gif)$/i),
      base64Data: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignForBrand(ctx.brand.id, input.campaignId);
      ensureOwnership(ctx.brand.id, existing);

      const buffer = Buffer.from(input.base64Data, "base64");
      const sizeBytes = buffer.byteLength;
      const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
      if (sizeBytes > MAX_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `Image must be at most ${MAX_BYTES / (1024 * 1024)} MB`,
        });
      }

      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `brands/${ctx.brand.id}/campaigns/${input.campaignId}/creative-${Date.now()}-${safeName}`;
      const result = await storagePut(key, buffer, input.contentType);
      await db.updateCampaignForBrand(ctx.brand.id, input.campaignId, {
        imageUrl: result.url,
      });
      return { url: result.url, key: result.key };
    }),

  metricsTimeseries: brandVerifiedProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      rangeDays: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const existing = await db.getCampaignForBrand(ctx.brand.id, input.campaignId);
      ensureOwnership(ctx.brand.id, existing);

      const fromDay = isoDay(input.rangeDays - 1);
      const toDay = isoDay(0);
      const rows = await db.getCampaignMetricsTimeseries({
        campaignId: input.campaignId,
        brandId: ctx.brand.id,
        fromDay,
        toDay,
      });

      // Fill missing days with zeros so the chart is continuous.
      const byDay = new Map(rows.map(r => [r.day, r]));
      const series: Array<{
        day: string;
        impressions: number;
        clicks: number;
        spendCents: number;
        ctr: number;
      }> = [];
      for (let i = input.rangeDays - 1; i >= 0; i--) {
        const day = isoDay(i);
        const row = byDay.get(day);
        const impressions = row?.impressions ?? 0;
        const clicks = row?.clicks ?? 0;
        const spendCents = row?.spendCents ?? 0;
        const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
        series.push({ day, impressions, clicks, spendCents, ctr });
      }

      const totals = series.reduce(
        (acc, r) => {
          acc.impressions += r.impressions;
          acc.clicks += r.clicks;
          acc.spendCents += r.spendCents;
          return acc;
        },
        { impressions: 0, clicks: 0, spendCents: 0 }
      );

      return {
        series,
        totals: {
          ...totals,
          ctr: totals.impressions > 0
            ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2))
            : 0,
        },
      };
    }),

  // For ad-serving infra to bump daily metrics. Internal but exposed for completeness.
  // In a real system this would live behind an internal API guard.
  recordEvent: brandVerifiedProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      kind: z.enum(["impression", "click"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCampaignForBrand(ctx.brand.id, input.campaignId);
      ensureOwnership(ctx.brand.id, existing);

      if (input.kind === "impression") {
        await db.bumpCampaignMetric({
          campaignId: input.campaignId,
          brandId: ctx.brand.id,
          impressions: 1,
        });
      } else {
        const spendCents = Math.round((existing.bidCpc ?? 0) * 100);
        await db.bumpCampaignMetric({
          campaignId: input.campaignId,
          brandId: ctx.brand.id,
          clicks: 1,
          spendCents,
        });
      }
      return { success: true };
    }),
});
