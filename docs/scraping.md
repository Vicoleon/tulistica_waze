# Scraping & daily refresh

Grocery Waze populates its catalog by scraping VTEX-powered Costa Rica grocery
chains. The current production chains are **Walmart Costa Rica**, **MaxiPalí**
and **Más x Menos**, all of which expose a public catalog API and don't need
authentication.

## On-demand

```bash
# Single chain
pnpm scrape walmart --limit 2400

# Everything in the registry sequentially
pnpm scrape all --limit 2400
```

Each chain caps near ~2,500 unique items in the default catalog query. To get
broader coverage, you'd need to query specific categories (see `vtex.ts`).

## Daily refresh

`scripts/refresh-daily.ts` runs every chain in the daily list with **per-chain
error isolation** — if one chain fails, the others still run. It exits 0 if at
least one chain succeeded, non-zero if everything failed (good cron exit codes).

```bash
pnpm refresh                # uses limit 2400 per chain
pnpm refresh --limit 1000   # faster refresh
```

Expected runtime: ~2-3 minutes for the three default chains at limit 2400.

## Scheduling

### macOS — launchd

`~/Library/LaunchAgents/cr.grocerywaze.refresh.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>          <string>cr.grocerywaze.refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /path/to/grocery-waze && pnpm refresh >> /tmp/grocerywaze-refresh.log 2>&amp;1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>   <integer>3</integer>
    <key>Minute</key> <integer>0</integer>
  </dict>
  <key>StandardOutPath</key> <string>/tmp/grocerywaze-refresh.out</string>
  <key>StandardErrorPath</key> <string>/tmp/grocerywaze-refresh.err</string>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/cr.grocerywaze.refresh.plist`

### Linux — systemd timer

`/etc/systemd/system/grocerywaze-refresh.service`:

```ini
[Unit]
Description=Grocery Waze daily scraper refresh
After=network-online.target mysql.service

[Service]
Type=oneshot
WorkingDirectory=/opt/grocery-waze
EnvironmentFile=/opt/grocery-waze/.env
ExecStart=/usr/bin/pnpm refresh
User=grocerywaze
```

`/etc/systemd/system/grocerywaze-refresh.timer`:

```ini
[Unit]
Description=Run grocery-waze refresh daily at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now grocerywaze-refresh.timer
systemctl list-timers | grep grocerywaze
```

### Linux — classic cron

```cron
# /etc/cron.d/grocerywaze
0 3 * * * grocerywaze cd /opt/grocery-waze && /usr/bin/pnpm refresh >> /var/log/grocerywaze.log 2>&1
```

### Hosted — GitHub Actions

`.github/workflows/refresh.yml`:

```yaml
name: Daily scraper refresh
on:
  schedule:
    - cron: '0 9 * * *'  # 03:00 CR (UTC-6) = 09:00 UTC
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET:   ${{ secrets.JWT_SECRET }}
        run: pnpm refresh
```

### Hosted — Railway / Fly cron

Both platforms support cron via their own dashboards — point them at
`pnpm refresh` with the same env vars as the main app.

## Monitoring

The refresh script prints a `[refresh] SUMMARY {...}` line at the end with a
JSON payload of per-chain results. Set up a log scraper (Datadog, Grafana
Loki, Better Stack, etc.) to alert when:

- `successCount < 3` for several days in a row (a chain broke)
- `totalUpserted < 1000` (catalog scraper returned suspiciously little data)

## Adding a new chain

1. Decide the platform. If it's VTEX (most CR chains), reuse `VtexScraper` from
   `server/scrapers/vtex.ts` — just register the chain in `registry.ts`.
2. If it's a custom Angular/React SPA without an API, you'll need a Playwright
   scraper. See `server/scrapers/automercado.ts` for a partially-built skeleton.
3. Add the chain to `DAILY_CHAINS` in `scripts/refresh-daily.ts` once it's
   stable enough to run unattended.

## Operational notes

- All scraped prices are attributed to a synthetic user `scraper:<chain>`.
- Each chain has a virtual store `<Chain> (en línea)` in the `stores` table
  centered on San José. Future work: distribute prices to physical stores.
- The `products` table dedupes by barcode (EAN) — products sold at multiple
  chains end up as one row with multiple `price_entries`.
- Robots.txt is respected automatically by `BaseScraper.politeFetch`.
- Default delay between requests is 800ms (`VtexScraper`) — bump it if a chain
  starts rate-limiting.
