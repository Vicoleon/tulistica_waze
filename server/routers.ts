import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import {
  SmartCartEngine,
  validateGeofence,
  isOutlierPrice,
  calculateTrustScoreChange,
  shouldRequireConfirmation,
  calculatePointsForPriceReport,
} from "./services/smartCart";
import { invokeLLM } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ USER PROFILE ============
  user: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return ctx.user;
    }),

    updateLocation: protectedProcedure
      .input(z.object({ latitude: z.number(), longitude: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserLocation(ctx.user.id, input.latitude, input.longitude);
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

  // ============ STORES ============
  stores: router({
    getNearby: publicProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusKm: z.number().default(10),
      }))
      .query(async ({ input }) => {
        return db.getNearbyStores(input.latitude, input.longitude, input.radiusKm);
      }),

    search: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        return db.searchStores(input.query, input.limit);
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
      .query(async ({ input }) => {
        return db.getPricesForProduct(input.productId);
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

    submit: protectedProcedure
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

        return {
          id,
          isVerified,
          isOutlier,
          withinGeofence,
          pointsEarned: points,
          requiresConfirmation,
        };
      }),

    vote: protectedProcedure
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
          fuelCostPerKm: user.fuelCostPerKm || 0.15,
          timeValuePerHour: user.timeValuePerHour || 15,
        });

        const results = await engine.optimizeCart(input.productIds, input.radiusKm);
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

    create: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createShoppingList({
          name: input.name,
          ownerId: ctx.user.id,
        });
        return { id };
      }),

    update: protectedProcedure
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

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteShoppingList(input.id);
        return { success: true };
      }),

    joinByCode: protectedProcedure
      .input(z.object({ shareCode: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const list = await db.getShoppingListByShareCode(input.shareCode);
        if (!list) throw new Error("Invalid share code");
        if (list.ownerId === ctx.user.id) throw new Error("You already own this list");
        await db.addListMember(list.id, ctx.user.id);
        return { listId: list.id };
      }),

    addItem: protectedProcedure
      .input(z.object({
        listId: z.number(),
        productId: z.number().optional(),
        customName: z.string().optional(),
        quantity: z.number().default(1),
        unit: z.string().optional(),
        notes: z.string().optional(),
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
        return { id };
      }),

    updateItem: protectedProcedure
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

    checkItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        isChecked: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.checkListItem(input.id, ctx.user.id, input.isChecked);
        return { success: true };
      }),

    removeItem: protectedProcedure
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

    extractFromUrl: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
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

        const extracted = JSON.parse(content);

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
});

export type AppRouter = typeof appRouter;
