import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  protectedProcedure,
  verifiedProcedure,
  adminProcedure,
  router,
} from "./_core/trpc";
import type { User } from "../drizzle/schema";

function sanitizeUser<T extends { passwordHash?: string | null } | null>(user: T): T {
  if (!user) return user;
  const { passwordHash, ...safe } = user as User;
  return safe as unknown as T;
}
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { brandAuthRouter } from "./brandRouters";
import { brandCampaignsRouter } from "./brandCampaignsRouter";
import { brandBillingRouter } from "./brandBillingRouter";
import {
  SmartCartEngine,
  validateGeofence,
  isOutlierPrice,
  calculateTrustScoreChange,
  shouldRequireConfirmation,
  calculatePointsForPriceReport,
} from "./services/smartCart";
import { invokeLLM, isLlmAvailable, extractJson, invalidateLlmConfigCache, LLM_PROVIDER_LIST, type LlmProvider } from "./_core/llm";
import {
  searchNearbyGroceryStores,
  getPlaceDetails,
  searchStoresByText,
  estimateStoreCrowdedness,
  lookupProduct,
  searchProductsOpenFoodFacts,
} from "./services/externalApis";
import { computeBudgetInsights } from "./services/budget";
import { discoverPhysicalStores } from "./services/storeDiscovery";
import { isOnlineStoreName } from "./services/chainMatch";
import { predictSeasonalDealsForUser, predictForProduct, rankPredictions } from "./services/seasonalDeals";
import { notifyOwner, isNotificationAvailable } from "./_core/notification";
import { isMapsAvailable } from "./_core/map";
import {
  HOUSEHOLD_SIZES,
  SHOPPING_CADENCES,
  STORE_PREFERENCES,
  SHOPPING_PRIORITIES,
  BASKET_CATEGORIES,
  ZONES,
  derivePriceTier,
  type ShopperProfile,
} from "../shared/profile";
import { ANALYTICS_EVENTS } from "../shared/analytics";
import { CAMPAIGN_SURFACES } from "../shared/campaigns";
import { brandProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { encryptCredential, decryptCredential } from "./_core/vault";

export const appRouter = router({
  system: systemRouter,

  // ============ BRAND PORTAL ============
  brandAuth: brandAuthRouter,
  brandCampaigns: brandCampaignsRouter,
  brandBilling: brandBillingRouter,

  // ============ FEATURE FLAGS ============
  features: router({
    status: publicProcedure.query(async () => ({
      maps: isMapsAvailable(),
      llm: await isLlmAvailable(),
      notifications: isNotificationAvailable(),
    })),
  }),

  // ============ ADMIN ============
  admin: router({
    // List all configured LLM keys (returns only metadata + masked tail).
    llmConfig: adminProcedure.query(async () => {
      const activeProvider = (await db.getAppSetting("llm.activeProvider")) as
        | LlmProvider
        | null;
      const keys = await Promise.all(
        LLM_PROVIDER_LIST.map(async (provider) => {
          const cred = await db.findAppIntegrationCredential(`llm_${provider}`);
          if (!cred) {
            return { provider, configured: false as const };
          }
          let maskedTail: string | null = null;
          try {
            const decoded = decryptCredential<{ apiKey: string }>(cred.ciphertext);
            maskedTail = decoded.apiKey.slice(-4);
          } catch {
            // ignore — show as configured-but-undecryptable
          }
          const model = await db.getAppSetting(`llm.model.${provider}`);
          return {
            provider,
            configured: true as const,
            maskedTail,
            updatedAt: cred.updatedAt,
            model,
          };
        })
      );
      return { activeProvider, keys };
    }),

    setLlmKey: adminProcedure
      .input(
        z.object({
          provider: z.enum(LLM_PROVIDER_LIST as [LlmProvider, ...LlmProvider[]]),
          apiKey: z.string().min(8).max(500),
        })
      )
      .mutation(async ({ input }) => {
        const ciphertext = encryptCredential({ apiKey: input.apiKey });
        await db.upsertAppIntegrationCredential(`llm_${input.provider}`, ciphertext);
        invalidateLlmConfigCache();
        return { ok: true };
      }),

    deleteLlmKey: adminProcedure
      .input(z.object({ provider: z.enum(LLM_PROVIDER_LIST as [LlmProvider, ...LlmProvider[]]) }))
      .mutation(async ({ input }) => {
        await db.deleteAppIntegrationCredential(`llm_${input.provider}`);
        invalidateLlmConfigCache();
        return { ok: true };
      }),

    setLlmActive: adminProcedure
      .input(
        z.object({
          provider: z.enum(LLM_PROVIDER_LIST as [LlmProvider, ...LlmProvider[]]),
          model: z.string().min(1).max(120),
        })
      )
      .mutation(async ({ input }) => {
        await db.setAppSetting("llm.activeProvider", input.provider);
        await db.setAppSetting(`llm.model.${input.provider}`, input.model);
        invalidateLlmConfigCache();
        return { ok: true };
      }),
  }),

  // ============ INTEGRATIONS (encrypted credential vault) ============
  integrations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.listIntegrationCredentials(ctx.user.id);
    }),

    save: protectedProcedure
      .input(
        z.object({
          integration: z.enum(["automercado"]),
          label: z.string().max(120).optional(),
          email: z.string().email("Correo inválido"),
          password: z.string().min(4).max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ciphertext = encryptCredential({
          email: input.email,
          password: input.password,
        });
        const id = await db.upsertIntegrationCredential({
          userId: ctx.user.id,
          integration: input.integration,
          label: input.label ?? null,
          ciphertext,
        });
        return { id, ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteIntegrationCredential(input.id, ctx.user.id);
        return { ok: true };
      }),
  }),

  auth: router({
    me: publicProcedure.query(opts => sanitizeUser(opts.ctx.user)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ USER PROFILE ============
  user: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return sanitizeUser(ctx.user);
    }),

    updateLocation: protectedProcedure
      .input(z.object({ latitude: z.number(), longitude: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserLocation(ctx.user.id, input.latitude, input.longitude);
        return { success: true };
      }),

    // Optional secondary location (workplace). Pass `null` for both fields
    // to clear it (e.g. the user removes their work address).
    updateWorkLocation: protectedProcedure
      .input(
        z.object({
          latitude: z.number().nullable(),
          longitude: z.number().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateUserWorkLocation(ctx.user.id, input.latitude, input.longitude);
        return { success: true };
      }),

    updatePreferences: protectedProcedure
      .input(z.object({
        defaultRadiusKm: z.number().optional(),
        fuelCostPerKm: z.number().optional(),
        timeValuePerHour: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPreferences(ctx.user.id, input);
        return { success: true };
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      const achievements = await db.getUserAchievements(ctx.user.id);
      const weeklyRank = await db.getUserRank(ctx.user.id, "weekly");
      return {
        trustScore: ctx.user.trustScore,
        totalPoints: ctx.user.totalPoints,
        priceReportsCount: ctx.user.priceReportsCount,
        verifiedReportsCount: ctx.user.verifiedReportsCount,
        achievements,
        weeklyRank: weeklyRank?.rank,
      };
    }),
  }),

  // ============ SHOPPER PROFILE (onboarding) ============
  profile: router({
    /** Returns the user's shopperProfile from preferences JSON, or null. */
    get: protectedProcedure.query(({ ctx }) => {
      return ctx.user.preferences?.shopperProfile ?? null;
    }),

    /**
     * Upsert the user's shopperProfile. Derives priceTier and stamps
     * onboardedAt server-side so the client can't fake completion.
     */
    update: protectedProcedure
      .input(
        z.object({
          householdSize: z.enum(HOUSEHOLD_SIZES),
          shoppingCadence: z.enum(SHOPPING_CADENCES),
          preferredChains: z
            .array(z.enum(STORE_PREFERENCES))
            .min(1, "Elegí al menos una tienda")
            .max(STORE_PREFERENCES.length),
          shoppingPriorities: z
            .array(z.enum(SHOPPING_PRIORITIES))
            .min(1, "Elegí al menos una prioridad")
            .max(3, "Máximo 3 prioridades"),
          basketMix: z
            .array(z.enum(BASKET_CATEGORIES))
            .min(1, "Elegí al menos una categoría")
            .max(3, "Máximo 3 categorías"),
          zone: z.enum(ZONES).optional(),
          savingsVsTimeBias: z.number().int().min(0).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const priceTier = derivePriceTier(
          input.preferredChains,
          input.shoppingPriorities
        );
        const shopperProfile: ShopperProfile = {
          ...input,
          priceTier,
          onboardedAt: new Date().toISOString(),
        };
        await db.updateUserPreferencesJson(ctx.user.id, { shopperProfile });
        // The user we have in ctx is stale (no shopperProfile yet); pass a
        // synthetic with the new profile so the event has the right facets.
        const userWithProfile = {
          ...ctx.user,
          preferences: { ...ctx.user.preferences, shopperProfile },
        };
        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
          user: userWithProfile,
          properties: {
            priceTier,
            householdSize: input.householdSize,
            cadence: input.shoppingCadence,
            preferredChainsCount: input.preferredChains.length,
            savingsVsTimeBias: input.savingsVsTimeBias,
          },
        });
        return { success: true, shopperProfile };
      }),
  }),

  // ============ ANALYTICS ============
  analytics: router({
    /**
     * Public so we can also record pre-login events (e.g. `onboarding_started`
     * fires before profile creation). Failures are swallowed inside
     * recordAnalyticsEvent — never surfaces to the client.
     */
    track: publicProcedure
      .input(
        z.object({
          eventName: z.string().min(1).max(64),
          properties: z.record(z.string(), z.unknown()).optional(),
          sessionId: z.string().max(64).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.recordAnalyticsEvent({
          eventName: input.eventName,
          user: ctx.user ?? null,
          sessionId: input.sessionId ?? null,
          properties: input.properties ?? {},
        });
        return { success: true };
      }),

    /** Admin-only dashboard summary. */
    summary: adminProcedure
      .input(z.object({ days: z.number().int().min(1).max(90).optional() }))
      .query(async ({ input }) => {
        return db.getAnalyticsSummary(input.days ?? 7);
      }),
  }),

  // ============ SPONSORED CAMPAIGNS (Fase 2) ============
  campaigns: router({
    /**
     * Returns campaigns eligible for the current viewer + surface. Records
     * an impression for each placement returned and logs an analytics event.
     * Empty array == no campaign matched (no error, no placeholder).
     */
    getForSurface: publicProcedure
      .input(
        z.object({
          surface: z.enum(CAMPAIGN_SURFACES),
          limit: z.number().int().min(1).max(5).default(1),
          keywords: z.array(z.string()).max(10).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const placements = await db.getEligibleCampaigns(
          input.surface,
          ctx.user ?? null,
          input.limit,
          input.keywords ?? []
        );
        // Fire-and-forget impression bookkeeping. We don't await the analytics
        // log so a slow inserts can't slow down the page.
        for (const p of placements) {
          void db.recordAdImpression(p.id);
          void db.recordAnalyticsEvent({
            eventName: "campaign_impression",
            user: ctx.user ?? null,
            properties: {
              campaignId: p.id,
              sponsor: p.sponsor,
              surface: input.surface,
              bidCpc: p.bidCpc,
            },
          });
        }
        // Strip server-only fields before returning.
        return placements.map((p) => ({
          id: p.id,
          sponsor: p.sponsor,
          type: p.type,
          title: p.title,
          description: p.description,
          imageUrl: p.imageUrl,
          targetUrl: p.targetUrl,
          productId: p.productId,
        }));
      }),

    /** User clicked a sponsored placement. Increments + logs event. */
    recordClick: publicProcedure
      .input(z.object({ campaignId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await db.recordAdClick(input.campaignId);
        await db.recordAnalyticsEvent({
          eventName: "campaign_click",
          user: ctx.user ?? null,
          properties: { campaignId: input.campaignId },
        });
        return { success: true };
      }),

    /**
     * Admin-only: per-campaign performance. Joined with `analytics_events`
     * so we report event-derived CTR alongside the legacy counter.
     */
    adminSummary: adminProcedure.query(async () => {
      return db.getCampaignPerformance();
    }),
  }),
  // ============ BRAND INSIGHTS (Fase 4) ============
  brandInsights: router({
    /** Aggregate intelligence dashboard for the logged-in brand. */
    summary: brandProcedure.query(async ({ ctx }) => {
      return db.getBrandInsights(ctx.brand.id);
    }),
  }),

  // ============ STORES ============
  stores: router({
    getNearby: publicProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusKm: z.number().default(10),
      }))
      .query(async ({ input }) => {
        const physical = await discoverPhysicalStores(
          input.latitude,
          input.longitude,
          input.radiusKm
        );
        // Shape compatible with the Stores/MapView client (store.id, name,
        // chainId, city, avgRating, latitude, longitude, distanceKm, address).
        return physical.map((s) => ({
          id: s.id, // real persisted store id (enables crowdedness/analytics/price submit)
          placeId: s.placeId,
          name: s.name,
          chainId: s.chainId,
          city: null as string | null,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          avgRating: s.avgRating,
          distanceKm: s.distanceKm,
        }));
      }),

    search: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const results = await db.searchStores(input.query, input.limit);
        // Never surface virtual online storefronts in the finder.
        return results.filter((s) => !isOnlineStoreName(s.name));
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getStoreById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        chainId: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createStore(input);
        return { id };
      }),
  }),

  // ============ PRODUCTS ============
  products: router({
    search: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().default(30) }))
      .query(async ({ input }) => {
        const products = await db.searchProducts(input.query, input.limit);
        // Inject sponsored products at positions 0 and 5
        const sponsored = await db.getSponsoredProducts([input.query], 2);
        if (sponsored.length > 0) {
          // Record impressions
          for (const ad of sponsored) {
            await db.recordAdImpression(ad.id);
          }
          // Inject at positions
          const result = [...products];
          if (sponsored[0]) {
            result.unshift({ ...sponsored[0], isSponsored: true } as any);
          }
          if (sponsored[1] && result.length > 5) {
            result.splice(5, 0, { ...sponsored[1], isSponsored: true } as any);
          }
          return result;
        }
        return products;
      }),

    getByBarcode: publicProcedure
      .input(z.object({ barcode: z.string() }))
      .query(async ({ input }) => {
        return db.getProductByBarcode(input.barcode);
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getProductById(input.id);
      }),

    getByCategory: publicProcedure
      .input(z.object({ category: z.string(), limit: z.number().default(50) }))
      .query(async ({ input }) => {
        return db.getProductsByCategory(input.category, input.limit);
      }),

    create: protectedProcedure
      .input(z.object({
        barcode: z.string().optional(),
        name: z.string(),
        brand: z.string().optional(),
        category: z.string().optional(),
        subcategory: z.string().optional(),
        description: z.string().optional(),
        unit: z.string().optional(),
        unitSize: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createProduct(input);
        return { id };
      }),
  }),

  // ============ PRICES ============
  prices: router({
    getForProduct: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ ctx, input }) => {
        const prices = await db.getPricesForProduct(input.productId);
        // Personalization: if the viewer has a shopper profile, surface their
        // preferred chains within the cheapest-price band. Cheapest is still
        // cheapest — we only reorder among comparably-priced options (within
        // 8% of the lowest price).
        const preferred =
          ctx.user?.preferences?.shopperProfile?.preferredChains ?? [];
        if (preferred.length === 0 || prices.length < 2) {
          return prices;
        }
        const lowest = Math.min(...prices.map((p) => p.price));
        const threshold = lowest * 1.08;
        const inBand = prices.filter((p) => p.price <= threshold);
        const outOfBand = prices.filter((p) => p.price > threshold);
        const isPreferred = (chain: string | null) =>
          chain ? preferred.includes(chain as any) : false;
        inBand.sort((a, b) => {
          const aPref = isPreferred(a.chainId) ? 1 : 0;
          const bPref = isPreferred(b.chainId) ? 1 : 0;
          if (aPref !== bPref) return bPref - aPref;
          return a.price - b.price;
        });
        outOfBand.sort((a, b) => a.price - b.price);
        return [...inBand, ...outOfBand];
      }),

    getLatest: publicProcedure
      .input(z.object({ storeId: z.number(), productId: z.number() }))
      .query(async ({ input }) => {
        return db.getLatestPrice(input.storeId, input.productId);
      }),

    getHistory: publicProcedure
      .input(z.object({ storeId: z.number(), productId: z.number(), days: z.number().default(30) }))
      .query(async ({ input }) => {
        return db.getPriceHistory(input.storeId, input.productId, input.days);
      }),

    submit: verifiedProcedure
      .input(z.object({
        storeId: z.number(),
        productId: z.number(),
        price: z.number(),
        userLatitude: z.number().optional(),
        userLongitude: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get store for geofence validation
        const store = await db.getStoreById(input.storeId);
        if (!store) throw new Error("Store not found");

        // Geofence validation
        let withinGeofence = false;
        if (input.userLatitude && input.userLongitude) {
          withinGeofence = validateGeofence(
            input.userLatitude,
            input.userLongitude,
            store.latitude,
            store.longitude
          );
        }

        // Outlier detection
        const stats = await db.getPriceStats(input.storeId, input.productId);
        let isOutlier = false;
        let zScore: number | undefined;
        if (stats && stats.count > 3 && stats.stdDev) {
          isOutlier = isOutlierPrice(input.price, stats.avgPrice, stats.stdDev);
          zScore = Math.abs((input.price - stats.avgPrice) / stats.stdDev);
        }

        // Check if requires confirmation based on trust score
        const requiresConfirmation = shouldRequireConfirmation(ctx.user.trustScore);
        const isVerified = !isOutlier && withinGeofence && !requiresConfirmation;

        // Create price entry
        const id = await db.createPriceEntry({
          storeId: input.storeId,
          productId: input.productId,
          userId: ctx.user.id,
          price: input.price,
          withinGeofence,
          submittedLatitude: input.userLatitude,
          submittedLongitude: input.userLongitude,
          isOutlier,
          isVerified,
          zScore,
        });

        // Award points
        const points = calculatePointsForPriceReport(isVerified, false, ctx.user.trustScore);
        await db.updateUserPoints(ctx.user.id, points);

        // Update trust score if verified
        if (isVerified) {
          await db.updateUserTrustScore(ctx.user.id, 1);
        }

        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.PRICE_REPORTED,
          user: ctx.user,
          properties: {
            storeId: input.storeId,
            productId: input.productId,
            price: input.price,
            isVerified,
            isOutlier,
            withinGeofence,
            pointsEarned: points,
            chainId: store.chainId,
          },
        });

        return {
          id,
          isVerified,
          isOutlier,
          withinGeofence,
          pointsEarned: points,
          requiresConfirmation,
        };
      }),

    vote: verifiedProcedure
      .input(z.object({
        priceEntryId: z.number(),
        voteType: z.enum(["confirm", "dispute"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user already voted
        const existingVote = await db.getUserVoteForPrice(input.priceEntryId, ctx.user.id);
        if (existingVote) {
          throw new Error("You have already voted on this price");
        }

        await db.addPriceVote(input.priceEntryId, ctx.user.id, input.voteType);

        // Award points for voting
        await db.updateUserPoints(ctx.user.id, 2);

        return { success: true };
      }),
  }),

  // ============ SMART CART OPTIMIZATION ============
  optimization: router({
    optimize: protectedProcedure
      .input(z.object({
        productIds: z.array(z.number()),
        radiusKm: z.number().default(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user;
        if (!user.homeLatitude || !user.homeLongitude) {
          throw new Error("Please set your home location first");
        }

        const engine = new SmartCartEngine({
          homeLatitude: user.homeLatitude,
          homeLongitude: user.homeLongitude,
          fuelCostPerKm: user.fuelCostPerKm ?? 250,
          timeValuePerHour: user.timeValuePerHour ?? 3000,
        });

        const results = await engine.optimizeCart(input.productIds, input.radiusKm);
        const best = Array.isArray(results) ? (results as any[])[0] : null;
        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.LIST_OPTIMIZED,
          user,
          properties: {
            productCount: input.productIds.length,
            radiusKm: input.radiusKm,
            savedAmount: best?.savings ?? null,
            strategy: best?.strategy ?? null,
          },
        });
        return results;
      }),
  }),

  // ============ SHOPPING LISTS ============
  lists: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserShoppingLists(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const list = await db.getShoppingListById(input.id);
        if (!list) return null;
        const items = await db.getListItems(input.id);
        const members = await db.getListMembers(input.id);
        return { ...list, items, members };
      }),

    create: verifiedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createShoppingList({
          name: input.name,
          ownerId: ctx.user.id,
        });
        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.LIST_CREATED,
          user: ctx.user,
          properties: { listId: id, nameLength: input.name.length },
        });
        return { id };
      }),

    update: verifiedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        isShared: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.isShared !== undefined) {
          updates.isShared = input.isShared;
          if (input.isShared) {
            updates.shareCode = nanoid(8);
          }
        }
        await db.updateShoppingList(input.id, updates);
        const list = await db.getShoppingListById(input.id);
        return list;
      }),

    delete: verifiedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteShoppingList(input.id);
        return { success: true };
      }),

    joinByCode: verifiedProcedure
      .input(z.object({ shareCode: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const list = await db.getShoppingListByShareCode(input.shareCode);
        if (!list) throw new Error("Invalid share code");
        if (list.ownerId === ctx.user.id) throw new Error("You already own this list");
        await db.addListMember(list.id, ctx.user.id);
        return { listId: list.id };
      }),

    addItem: verifiedProcedure
      .input(z.object({
        listId: z.number(),
        productId: z.number().optional(),
        customName: z.string().optional(),
        quantity: z.number().default(1),
        unit: z.string().optional(),
        notes: z.string().optional(),
        source: z.string().optional(), // "search" | "recipe" | "scan" | "manual" | "pantry"
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.addListItem({
          listId: input.listId,
          productId: input.productId,
          customName: input.customName,
          quantity: input.quantity,
          unit: input.unit,
          notes: input.notes,
          addedByUserId: ctx.user.id,
        });
        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.LIST_ITEM_ADDED,
          user: ctx.user,
          properties: {
            listId: input.listId,
            productId: input.productId,
            source: input.source ?? "manual",
            quantity: input.quantity,
          },
        });
        return { id };
      }),

    updateItem: verifiedProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateListItem(input.id, {
          quantity: input.quantity,
          notes: input.notes,
        });
        return { success: true };
      }),

    checkItem: verifiedProcedure
      .input(z.object({
        id: z.number(),
        isChecked: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.checkListItem(input.id, ctx.user.id, input.isChecked);
        return { success: true };
      }),

    removeItem: verifiedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteListItem(input.id);
        return { success: true };
      }),
  }),

  // ============ PANTRY ============
  pantry: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserPantry(ctx.user.id);
    }),

    getRestockSuggestions: protectedProcedure.query(async ({ ctx }) => {
      return db.getPantryRestockSuggestions(ctx.user.id);
    }),

    add: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        customName: z.string().optional(),
        quantity: z.number().default(1),
        notifyWhenLow: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.addPantryItem({
          userId: ctx.user.id,
          productId: input.productId,
          customName: input.customName,
          quantity: input.quantity,
          notifyWhenLow: input.notifyWhenLow,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.number().optional(),
        notifyWhenLow: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updatePantryItem(input.id, {
          quantity: input.quantity,
          notifyWhenLow: input.notifyWhenLow,
        });
        return { success: true };
      }),

    recordPurchase: protectedProcedure
      .input(z.object({
        productId: z.number(),
        storeId: z.number().optional(),
        price: z.number().optional(),
        quantity: z.number().default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.recordPurchase(
          ctx.user.id,
          input.productId,
          input.storeId ?? null,
          input.price ?? null,
          input.quantity
        );
        return { success: true };
      }),
  }),

  // ============ RECIPES ============
  recipes: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserRecipes(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecipeById(input.id);
      }),

    generate: protectedProcedure
      .input(
        z.object({
          request: z.string().min(3).max(500),
          servings: z.number().int().min(1).max(20).default(4),
          usePantry: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!(await isLlmAvailable())) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "La generación de recetas requiere configurar OPENAI_API_KEY. Activá la función en .env para habilitarla.",
          });
        }

        // Personalize from pantry + recent purchases when available.
        let pantryContext = "";
        if (input.usePantry) {
          const pantry = await db.getUserPantry(ctx.user.id);
          const pantryNames = pantry
            .map((p) => p.productName || p.customName)
            .filter(Boolean)
            .slice(0, 30);
          if (pantryNames.length > 0) {
            pantryContext = `\n\nProductos que la persona ya tiene en su despensa (preferí usarlos cuando aporten): ${pantryNames.join(", ")}.`;
          }
        }

        const systemPrompt = `Sos una cocinera tica experta en cocina costarricense tradicional y comida casera del día a día. Generás recetas claras, realistas y económicas usando ingredientes y marcas comunes en Costa Rica (Dos Pinos, Lizano, Tío Pelón, Don Pedro, Sardimar, etc.).

Reglas:
- Cantidades en sistema métrico o medidas caseras (taza, cucharadita).
- Pasos numerados, cortos y accionables (10 pasos máximo).
- Sin notas adicionales fuera del JSON.
- Si la persona pide algo no-tico, adaptá los ingredientes a lo que se consigue en supermercados de Costa Rica.${pantryContext}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Generá una receta para ${input.servings} porciones. Pedido: "${input.request}". Devolvé únicamente JSON válido.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "recipe_generation",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  servings: { type: "integer" },
                  prepTimeMinutes: { type: "integer" },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "string" },
                        unit: { type: "string" },
                      },
                      required: ["name", "quantity"],
                      additionalProperties: false,
                    },
                  },
                  steps: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["name", "ingredients", "steps"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "El modelo no devolvió una respuesta válida.",
          });
        }

        const recipe = extractJson<{
          name: string;
          description?: string;
          servings?: number;
          prepTimeMinutes?: number;
          ingredients: Array<{ name: string; quantity: string; unit?: string }>;
          steps: string[];
        }>(content);

        // Match ingredients to products in our DB so they're optimizable.
        const ingredientsWithProducts = await Promise.all(
          recipe.ingredients.map(async (ing) => {
            const products = await db.searchProducts(ing.name, 1);
            return { ...ing, productId: products[0]?.id };
          })
        );

        const id = await db.saveRecipe({
          userId: ctx.user.id,
          name: recipe.name,
          sourceUrl: null,
          servings: recipe.servings ?? input.servings,
          ingredients: ingredientsWithProducts,
          steps: recipe.steps,
          description: recipe.description,
          prepTimeMinutes: recipe.prepTimeMinutes,
          isAiGenerated: true,
        });

        return {
          id,
          name: recipe.name,
          description: recipe.description,
          servings: recipe.servings ?? input.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          ingredients: ingredientsWithProducts,
          steps: recipe.steps,
        };
      }),

    extractFromUrl: protectedProcedure
      .input(z.object({ url: z.string().url("URL inválido") }))
      .mutation(async ({ ctx, input }) => {
        if (!(await isLlmAvailable())) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "La extracción de recetas requiere configurar OPENAI_API_KEY. Activá la función en .env para habilitarla.",
          });
        }
        // Use LLM to extract ingredients from recipe URL
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a recipe ingredient extractor. Given a recipe URL, extract the recipe name, servings, and list of ingredients. Return a JSON object with this structure:
{
  "name": "Recipe Name",
  "servings": 4,
  "ingredients": [
    { "name": "ingredient name", "quantity": "2", "unit": "cups" },
    ...
  ]
}
Only return valid JSON, no other text.`,
            },
            {
              role: "user",
              content: `Extract ingredients from this recipe URL: ${input.url}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "recipe_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  servings: { type: "integer" },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "string" },
                        unit: { type: "string" },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["name", "ingredients"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== 'string') throw new Error("Failed to extract recipe");

        const extracted = extractJson<{
          name: string;
          servings?: number;
          ingredients: Array<{ name: string; quantity?: string; unit?: string }>;
        }>(content);

        // Try to match ingredients to products in database
        const ingredientsWithProducts = await Promise.all(
          extracted.ingredients.map(async (ing: any) => {
            const products = await db.searchProducts(ing.name, 1);
            return {
              ...ing,
              productId: products[0]?.id,
            };
          })
        );

        // Save recipe
        const id = await db.saveRecipe({
          userId: ctx.user.id,
          name: extracted.name,
          sourceUrl: input.url,
          servings: extracted.servings,
          ingredients: ingredientsWithProducts,
        });

        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.RECIPE_IMPORTED,
          user: ctx.user,
          properties: {
            recipeId: id,
            sourceUrl: input.url,
            servings: extracted.servings,
            ingredientCount: ingredientsWithProducts.length,
            matchedProducts: ingredientsWithProducts.filter(
              (i: any) => i.productId
            ).length,
          },
        });

        return {
          id,
          name: extracted.name,
          servings: extracted.servings,
          ingredients: ingredientsWithProducts,
        };
      }),

    addToList: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        listId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const recipe = await db.getRecipeById(input.recipeId);
        if (!recipe) throw new Error("Recipe not found");

        const ingredients = recipe.ingredients as any[];
        for (const ing of ingredients) {
          await db.addListItem({
            listId: input.listId,
            productId: ing.productId,
            customName: ing.productId ? undefined : ing.name,
            quantity: parseInt(ing.quantity) || 1,
            unit: ing.unit,
            addedByUserId: ctx.user.id,
          });
        }

        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.RECIPE_ADDED_TO_LIST,
          user: ctx.user,
          properties: {
            recipeId: input.recipeId,
            listId: input.listId,
            itemsAdded: ingredients.length,
          },
        });

        return { success: true, itemsAdded: ingredients.length };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRecipe(input.id);
        return { success: true };
      }),
  }),

  // ============ GAMIFICATION ============
  gamification: router({
    getLeaderboard: publicProcedure
      .input(z.object({
        period: z.enum(["weekly", "monthly", "alltime"]).default("weekly"),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        return db.getLeaderboard(input.period, input.limit);
      }),

    getAchievements: publicProcedure.query(async () => {
      return db.getAchievements();
    }),

    getUserAchievements: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserAchievements(ctx.user.id);
    }),
  }),

  // ============ ADS ============
  ads: router({
    getCartSuggestions: publicProcedure
      .input(z.object({ cartCategories: z.array(z.string()) }))
      .query(async ({ input }) => {
        const suggestions = await db.getCartSuggestions(input.cartCategories);
        // Record impressions
        for (const ad of suggestions) {
          await db.recordAdImpression(ad.id);
        }
        return suggestions;
      }),

    recordClick: publicProcedure
      .input(z.object({ adId: z.number() }))
      .mutation(async ({ input }) => {
        await db.recordAdClick(input.adId);
        return { success: true };
      }),
  }),

  // ============ GOOGLE PLACES INTEGRATION ============
  googlePlaces: router({
    searchNearby: publicProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusMeters: z.number().default(5000),
      }))
      .query(async ({ input }) => {
        const places = await searchNearbyGroceryStores(
          input.latitude,
          input.longitude,
          input.radiusMeters
        );
        // Cache results
        for (const place of places) {
          await db.cacheGooglePlace({
            placeId: place.placeId,
            name: place.name,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            priceLevel: place.priceLevel,
            types: place.types,
            openNow: place.openNow,
          });
        }
        return places;
      }),

    searchByText: publicProcedure
      .input(z.object({
        query: z.string(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return searchStoresByText(input.query, input.latitude, input.longitude);
      }),

    getDetails: publicProcedure
      .input(z.object({ placeId: z.string() }))
      .query(async ({ input }) => {
        const details = await getPlaceDetails(input.placeId);
        if (details) {
          // Update cache with detailed info
          await db.cacheGooglePlace({
            placeId: details.placeId,
            name: details.name,
            address: details.address,
            latitude: details.latitude,
            longitude: details.longitude,
            rating: details.rating,
            userRatingsTotal: details.userRatingsTotal,
            priceLevel: details.priceLevel,
            types: details.types,
            phone: details.phone,
            website: details.website,
            openNow: details.openNow,
          });
        }
        return details;
      }),

    importAsStore: protectedProcedure
      .input(z.object({ placeId: z.string() }))
      .mutation(async ({ input }) => {
        const storeId = await db.importGooglePlaceAsStore(input.placeId);
        return { storeId };
      }),

    getCached: publicProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusKm: z.number().default(10),
      }))
      .query(async ({ input }) => {
        return db.getNearbyGooglePlaces(input.latitude, input.longitude, input.radiusKm);
      }),
  }),

  // ============ PRODUCT LOOKUP (EXTERNAL) ============
  productLookup: router({
    /**
     * Recognize a product from a base64-encoded photo. Uses the configured
     * vision-capable LLM. Returns a best-guess name/brand/category and tries
     * to match against our product DB. The client can then confirm or edit.
     */
    fromPhoto: protectedProcedure
      .input(
        z.object({
          // data:image/jpeg;base64,... or data:image/png;base64,...
          imageDataUrl: z
            .string()
            .max(8_000_000, "La imagen supera el límite de 8MB")
            .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Formato de imagen no soportado"),
        })
      )
      .mutation(async ({ input }) => {
        if (!(await isLlmAvailable())) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "El reconocimiento por foto requiere configurar OPENAI_API_KEY. Activá la función en .env para habilitarla.",
          });
        }

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "Sos un asistente que identifica productos de supermercado en Costa Rica. Si la imagen muestra un producto, devolvé en JSON el nombre principal, la marca y la categoría (Granos, Lácteos, Bebidas, Limpieza, etc.). Si ves un código de barras EAN/UPC, devolvelo también. Si no se ve un producto claramente, devolvé identified=false y dejá los demás campos vacíos.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Identificá este producto." },
                {
                  type: "image_url",
                  image_url: { url: input.imageDataUrl, detail: "low" },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_recognition",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  identified: { type: "boolean" },
                  name: { type: "string" },
                  brand: { type: "string" },
                  category: { type: "string" },
                  barcode: { type: "string" },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                  },
                },
                required: ["identified", "name", "brand", "category", "barcode", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "El modelo no devolvió una respuesta válida.",
          });
        }
        const parsed = extractJson<{
          identified: boolean;
          name: string;
          brand: string;
          category: string;
          barcode: string;
          confidence: "low" | "medium" | "high";
        }>(content);

        if (!parsed.identified) {
          return { identified: false as const };
        }

        // Try DB match: by barcode first (when present), then by name+brand search.
        let matchedProduct = null;
        if (parsed.barcode) {
          matchedProduct = await db.getProductByBarcode(parsed.barcode);
        }
        if (!matchedProduct && parsed.name) {
          const query = parsed.brand ? `${parsed.name} ${parsed.brand}` : parsed.name;
          const results = await db.searchProducts(query, 1);
          matchedProduct = results[0] ?? null;
        }

        // No match — seed a new product so it has an id usable by pantry/lists.
        // High-confidence recognitions get persisted; low-confidence ones are
        // returned without persistence so callers can require user confirmation.
        let createdId: number | null = null;
        if (!matchedProduct && parsed.confidence !== "low") {
          createdId = await db.createProduct({
            barcode: parsed.barcode || undefined,
            name: parsed.name.trim(),
            brand: parsed.brand?.trim() || undefined,
            category: parsed.category?.trim() || undefined,
          });
        }
        const product =
          matchedProduct ??
          (createdId
            ? {
                id: createdId,
                barcode: parsed.barcode || null,
                name: parsed.name,
                brand: parsed.brand || null,
                category: parsed.category || null,
              }
            : null);

        return {
          identified: true as const,
          recognition: parsed,
          product,
          created: !matchedProduct && createdId !== null,
        };
      }),

    byBarcode: publicProcedure
      .input(z.object({ barcode: z.string() }))
      .query(async ({ input }) => {
        // First check our database
        const localProduct = await db.getProductByBarcode(input.barcode);
        if (localProduct) {
          return { source: "local" as const, product: localProduct };
        }
        // Fallback to external APIs
        const externalProduct = await lookupProduct(input.barcode);
        if (externalProduct) {
          // Optionally save to our database
          const id = await db.createProduct({
            barcode: externalProduct.barcode,
            name: externalProduct.name,
            brand: externalProduct.brand,
            category: externalProduct.category,
            imageUrl: externalProduct.imageUrl,
          });
          return {
            source: "external" as const,
            product: { id, ...externalProduct },
          };
        }
        return { source: "not_found" as const, product: null };
      }),

    searchExternal: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        return searchProductsOpenFoodFacts(input.query, input.limit);
      }),
  }),

  // ============ STORE CROWDEDNESS ============
  crowdedness: router({
    getCurrent: publicProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ input }) => {
        // Get user-reported crowdedness
        const userReport = await db.getStoreCrowdedness(input.storeId);
        // Get store info for estimation
        const store = await db.getStoreById(input.storeId);
        // Estimate based on time/day patterns
        const estimated = estimateStoreCrowdedness(
          store?.avgRating ?? undefined,
          store?.totalRatings ?? undefined
        );
        return {
          userReport,
          estimated,
          // Use user report if recent, otherwise use estimate
          current: userReport ? {
            level: userReport.crowdednessLevel,
            source: userReport.reportSource,
            reportedAt: userReport.reportedAt,
          } : {
            level: estimated.currentPopularity,
            source: "estimated" as const,
            status: estimated.status,
          },
        };
      }),

    report: verifiedProcedure
      .input(z.object({
        storeId: z.number(),
        crowdednessLevel: z.number().min(0).max(100),
        waitTimeMinutes: z.number().optional(),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.reportStoreCrowdedness({
          storeId: input.storeId,
          userId: ctx.user.id,
          crowdednessLevel: input.crowdednessLevel,
          reportSource: "user",
          waitTimeMinutes: input.waitTimeMinutes,
          comment: input.comment,
        });
        return { id };
      }),

    getHistory: publicProcedure
      .input(z.object({
        storeId: z.number(),
        hours: z.number().default(24),
      }))
      .query(async ({ input }) => {
        return db.getRecentCrowdednessReports(input.storeId, input.hours);
      }),
  }),

  // ============ PRICE ALERTS ============
  priceAlerts: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserPriceAlerts(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        productId: z.number(),
        targetPrice: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get current lowest price
        const prices = await db.getPricesForProduct(input.productId);
        const lowestPrice = prices.length > 0
          ? Math.min(...prices.map((p: { price: number }) => p.price))
          : null;
        const lowestStore = prices.find((p: { price: number; storeId: number }) => p.price === lowestPrice);

        const id = await db.createPriceAlert({
          userId: ctx.user.id,
          productId: input.productId,
          targetPrice: input.targetPrice,
          currentLowestPrice: lowestPrice,
          currentLowestStoreId: lowestStore?.storeId,
        });
        await db.recordAnalyticsEvent({
          eventName: ANALYTICS_EVENTS.ALERT_CREATED,
          user: ctx.user,
          properties: {
            alertId: id,
            productId: input.productId,
            targetPrice: input.targetPrice,
            currentLowestPrice: lowestPrice,
            gapPct:
              lowestPrice && lowestPrice > 0
                ? Math.round(
                    ((lowestPrice - input.targetPrice) / lowestPrice) * 100
                  )
                : null,
          },
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        targetPrice: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updatePriceAlert(input.id, {
          targetPrice: input.targetPrice,
          isActive: input.isActive,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deletePriceAlert(input.id);
        return { success: true };
      }),

    checkAndNotify: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(async ({ input }) => {
        // Get all active alerts for this product
        const alerts = await db.getActiveAlertsForProduct(input.productId);
        // Get current prices
        const prices = await db.getPricesForProduct(input.productId);
        if (prices.length === 0) return { notified: 0 };

        const lowestPrice = Math.min(...prices.map((p: { price: number }) => p.price));
        let notified = 0;

        for (const alert of alerts) {
          if (lowestPrice <= alert.targetPrice) {
            // Price dropped below target!
            const product = await db.getProductById(input.productId);
            if (isNotificationAvailable()) {
              await notifyOwner({
                title: `Alerta de precio: ${product?.name}`,
                content: `${product?.name} ahora cuesta ₡${lowestPrice.toLocaleString("es-CR")} (tu objetivo: ₡${alert.targetPrice.toLocaleString("es-CR")})`,
              });
            }
            await db.markAlertNotified(alert.id);
            notified++;
          }
        }

        return { notified, lowestPrice };
      }),
  }),

  // ============ BUDGET TRACKER ============
  budget: router({
    getInsights: protectedProcedure.query(async ({ ctx }) => {
      return computeBudgetInsights(ctx.user.id);
    }),

    setBudget: protectedProcedure
      .input(z.object({
        monthlyBudget: z.number().positive().max(1000000),
        budgetAlertThreshold: z.number().min(0.1).max(1).default(0.8),
        budgetCycleStartDay: z.number().int().min(1).max(28).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.setUserBudget(ctx.user.id, input);
        return { success: true };
      }),

    clearBudget: protectedProcedure.mutation(async ({ ctx }) => {
      await db.clearUserBudget(ctx.user.id);
      return { success: true };
    }),
  }),

  // ============ SEASONAL DEAL PREDICTIONS ============
  seasonal: router({
    getPredictions: protectedProcedure.query(async ({ ctx }) => {
      const predictions = await predictSeasonalDealsForUser(ctx.user.id);
      return rankPredictions(predictions);
    }),

    getProductPrediction: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const product = await db.getProductById(input.productId);
        if (!product) throw new Error("Product not found");
        return predictForProduct(product.id, product.name, product.category ?? null);
      }),
  }),
});

export type AppRouter = typeof appRouter;
