import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { ENV } from "./_core/env";
import { brandVerifiedProcedure, router } from "./_core/trpc";

const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "periodMonth must be YYYY-MM");

const TAX_RATE = 0.13; // Costa Rica IVA default

function formatMoneyCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const brandBillingRouter = router({
  listInvoices: brandVerifiedProcedure.query(async ({ ctx }) => {
    const invoices = await db.listInvoicesForBrand(ctx.brand.id);
    return invoices.map(inv => ({
      ...inv,
      totalFormatted: formatMoneyCents(inv.totalCents, inv.currency),
    }));
  }),

  getInvoice: brandVerifiedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const invoice = await db.getInvoiceForBrand(ctx.brand.id, input.id);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      const items = await db.listInvoiceLineItems(invoice.id);
      return { invoice, items };
    }),

  /**
   * Either returns the existing invoice for the period or computes a fresh
   * snapshot from campaign_metrics. Generated invoices start in `open` status.
   */
  generateForPeriod: brandVerifiedProcedure
    .input(z.object({ periodMonth: periodSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const periodMonth = input.periodMonth ?? db.currentPeriodMonth();
      const existing = await db.getInvoiceForBrandByPeriod(ctx.brand.id, periodMonth);
      if (existing && existing.status !== "draft") return existing;

      const spend = await db.getBrandSpendByPeriod({
        brandId: ctx.brand.id,
        periodMonth,
      });
      const subtotal = spend.reduce((sum, row) => sum + Number(row.spendCents ?? 0), 0);
      const tax = Math.round(subtotal * TAX_RATE);
      const total = subtotal + tax;

      let invoiceId = existing?.id ?? null;
      if (!invoiceId) {
        invoiceId = await db.createInvoice({
          brandId: ctx.brand.id,
          periodMonth,
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: total,
          currency: "USD",
          status: subtotal > 0 ? "open" : "draft",
          issuedAt: new Date(),
          dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        });
      } else {
        await db.updateInvoice(invoiceId, {
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: total,
          status: subtotal > 0 ? "open" : "draft",
        });
      }

      if (invoiceId && spend.length > 0) {
        await db.createInvoiceLineItems(spend.map(row => ({
          invoiceId: invoiceId as number,
          campaignId: Number(row.campaignId) || null,
          description: `Campaign #${row.campaignId} — ${Number(row.clicks ?? 0)} clicks / ${Number(row.impressions ?? 0)} impressions`,
          quantity: Number(row.clicks ?? 0),
          unitPriceCents: Number(row.clicks ?? 0) > 0
            ? Math.round(Number(row.spendCents ?? 0) / Number(row.clicks))
            : 0,
          amountCents: Number(row.spendCents ?? 0),
        })));
      }

      return invoiceId ? await db.getInvoiceForBrand(ctx.brand.id, invoiceId) : null;
    }),

  exportMonthlyCsv: brandVerifiedProcedure
    .input(z.object({ periodMonth: periodSchema }))
    .query(async ({ ctx, input }) => {
      const spend = await db.getBrandSpendByPeriod({
        brandId: ctx.brand.id,
        periodMonth: input.periodMonth,
      });

      const header = [
        "period",
        "brand_id",
        "brand_name",
        "campaign_id",
        "impressions",
        "clicks",
        "ctr_percent",
        "spend_cents",
        "spend_usd",
      ].join(",");

      const lines = spend.map(row => {
        const impressions = Number(row.impressions ?? 0);
        const clicks = Number(row.clicks ?? 0);
        const spendCents = Number(row.spendCents ?? 0);
        const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0";
        return [
          input.periodMonth,
          ctx.brand.id,
          csvEscape(ctx.brand.companyName),
          Number(row.campaignId),
          impressions,
          clicks,
          ctr,
          spendCents,
          (spendCents / 100).toFixed(2),
        ].map(csvEscape).join(",");
      });

      const csv = [header, ...lines].join("\n") + "\n";
      const filename = `invoice-${ctx.brand.id}-${input.periodMonth}.csv`;
      return {
        csv,
        filename,
        contentType: "text/csv; charset=utf-8",
      };
    }),

  createPaymentIntent: brandVerifiedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await db.getInvoiceForBrand(ctx.brand.id, input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.status === "paid") {
        return { alreadyPaid: true, providerId: invoice.paymentProviderId };
      }

      // Stub: when paymentProvider="stripe" and key is set, delegate.
      if (ENV.paymentProvider === "stripe" && ENV.stripeSecretKey) {
        // Real impl would call stripe.paymentIntents.create here.
        const providerId = `pi_stub_${Date.now()}`;
        await db.updateInvoice(invoice.id, {
          paymentProvider: "stripe",
          paymentProviderId: providerId,
        });
        return {
          provider: "stripe",
          providerId,
          clientSecret: `cs_stub_${providerId}`,
          amountCents: invoice.totalCents,
          currency: invoice.currency,
        };
      }

      // Stub provider for dev: auto-mark as paid.
      const providerId = `dev_${Date.now()}`;
      await db.updateInvoice(invoice.id, {
        status: "paid",
        paidAt: new Date(),
        paymentProvider: "stub",
        paymentProviderId: providerId,
      });
      return {
        provider: "stub",
        providerId,
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        autoPaid: true,
      };
    }),
});
