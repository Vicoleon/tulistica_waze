# Grocery Waze - Project TODO

## Core Infrastructure
- [x] Database schema for users, stores, products, prices, lists
- [x] Geospatial store search with distance calculations
- [x] User trust scoring system (0-100)

## Smart Cart Optimization
- [x] Single-store price calculation
- [x] Multi-store split shopping optimization
- [x] Travel cost calculation (fuel + time value)
- [x] Optimal route recommendation

## Crowdsourced Price System
- [x] Price entry submission with geofence validation
- [x] Outlier detection using Z-score analysis
- [x] Price verification and voting system
- [x] Trust score updates based on contributions

## Barcode Scanner (PWA)
- [x] QuaggaJS integration for barcode scanning
- [x] Product lookup by barcode
- [x] Quick price submission interface

## Social Shopping Lists
- [x] Create and manage shopping lists
- [x] Share lists with family/roommates
- [x] Real-time WebSocket updates
- [x] Item check-off synchronization

## Ad System
- [x] Sponsored product injection in search
- [x] Smart banner recommendations
- [x] Association rules for cart-based suggestions

## Recipe & Pantry Features
- [x] Recipe URL ingredient extraction (LLM)
- [x] Ingredient to product mapping
- [x] Pantry tracker with purchase history
- [x] Predictive restock notifications

## Map & Visualization
- [x] Interactive map with nearby stores
- [x] Price comparison overlays
- [x] Optimal route visualization
- [x] Store details and user reviews

## Gamification
- [x] Points system for price reporting
- [x] User leaderboard
- [x] Achievement badges
- [x] Weekly/monthly challenges

## Additional Cool Features (Bonus)
- [x] Price history tracking in database
- [ ] Price drop alerts (notification system ready)
- [ ] Store crowdedness indicator
- [ ] Seasonal deal predictions
- [ ] Budget tracker with spending insights

## UI/UX
- [x] Landing page with feature showcase
- [x] Dashboard with user stats
- [x] Profile/settings page
- [x] Fresh green/teal color theme
- [x] Responsive design
- [x] Store finder page
- [x] Product search page
- [x] Shopping lists management
- [x] List detail with real-time sync
- [x] Barcode scanner page
- [x] Smart Cart optimizer page
- [x] Pantry tracker page
- [x] Recipe converter page
- [x] Leaderboard page
- [x] Interactive map view

## Testing
- [x] API tests for stores router
- [x] API tests for products router
- [x] API tests for auth router

## Dynamic Data Integration (New)
- [x] Google Maps Places API for dynamic store discovery
- [x] Auto-import nearby grocery stores from Google Maps
- [x] Open Food Facts API integration for product data
- [x] Barcode lookup with automatic product info population
- [x] Store crowdedness indicator using Google Popular Times
- [x] Real-time busyness display on store cards and map
- [x] Price drop alerts notification system
- [x] User price threshold settings
- [x] Alert history and management

## Seed Data
- [x] Create seed script for Costa Rica grocery stores
- [x] Fetch stores from major Costa Rica cities via Google Maps
- [x] Import stores into database (187 stores)
- [x] Add sample products (20 Costa Rican products)

## Bug Fixes
- [ ] Fix Optimize button not working

## Brand Portal (New)
- [x] DB schema: brands, brand_tokens, campaign_metrics, invoices, invoice_line_items
- [x] Migration 0003_brand_portal.sql
- [x] Brand auth (register/login/logout/me) with scrypt password hashing
- [x] Email verification (token-based) and resend flow
- [x] Password reset (request + reset with token)
- [x] Brand profile update + change password
- [x] Logo upload via storagePut
- [x] Full campaign CRUD (create, update, delete) beyond pause/resume
- [x] Campaign image upload for creatives (5 MB cap, image/* only)
- [x] Per-campaign performance graphs over time (recharts, configurable 7/14/30/90 day window)
- [x] Daily campaign_metrics aggregation wired into recordAdImpression/recordAdClick
- [x] Monthly billing aggregation from campaign_metrics
- [x] CSV export endpoint with per-campaign spend breakdown
- [x] Invoice generation for a period + payment intent stub (Stripe-ready)
- [x] /brand/login, /brand/register, /brand/verify-email, /brand/forgot-password, /brand/reset-password
- [x] /brand/dashboard with KPIs and recent campaigns/invoices
- [x] /brand/campaigns list with pause/resume inline
- [x] /brand/campaigns/new full form
- [x] /brand/campaigns/:id with Performance / Creative / Edit tabs
- [x] /brand/billing with CSV download and Pay button
- [x] /brand/settings for profile and password
