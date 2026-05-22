# Phase 7 - Source Sync

## Naver Prices

`scripts/sync-naver-prices.mjs` fetches daily prices from Naver Finance and upserts them into `public.stock_prices`.

Before running it, apply:

```txt
supabase/migrations/0004_stock_prices_naver_fields.sql
```

Examples:

```bash
npm run sync:prices -- --symbols A005930,A000660 --from 2026-05-01 --to 2026-05-22 --dry-run
npm run sync:prices -- --symbols A005930,A000660 --days 30
npm run sync:prices -- --source local --days 7
```

If `reports` is already imported to Supabase, the default `--source auto` reads distinct `gicode` values from Supabase. If Supabase has no rows, it falls back to `data/reports.ndjson`.

## Reports

`scripts/sync-fnguide-reports.mjs` fetches FnGuide summary reports from `SVD_Report_Summary_Data.asp` and upserts normalized rows into `public.reports`.

Examples:

```bash
npm run sync:reports -- --source live --from 2026-05-21 --to 2026-05-21 --dry-run
npm run sync:reports -- --source live --days 7
npm run sync:reports -- --source live --days 7 --keyword 삼성전자
npm run sync:reports -- --source payload --dry-run
npm run sync:reports
npm run sync:reports -- --source payload --input "../dashboard (1).html"
```

`--source live` is the default. `--source payload` remains available for importing the existing dashboard HTML payload.

## Scheduling

GitHub Actions workflows:

```txt
.github/workflows/fnguide-report-sync.yml
.github/workflows/naver-price-sync.yml
```

Required GitHub repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Schedules use UTC cron but are documented here in KST:

- FnGuide reports: 08:30 KST, Monday-Friday.
- Naver prices: 16:30 KST, Monday-Friday.

Both workflows can also be launched manually from the Actions tab.
