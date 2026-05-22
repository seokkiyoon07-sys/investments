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
npm run sync:prices -- --source supabase --years 10 --only-missing
npm run sync:prices -- --source supabase --years 10 --max-symbols 300 --offset 0 --only-missing
```

If `reports` is already imported to Supabase, the default `--source auto` reads distinct `gicode` values from Supabase. If Supabase has no rows, it falls back to `data/reports.ndjson`.

For long backfills, use `--years 10` to request ten years of daily prices from Naver. `--only-missing` skips symbols whose stored rows already cover the requested range, and `--max-symbols` plus `--offset` lets the backfill run in smaller batches.

After prices are available, update report outcome fields from the stored daily closes:

```bash
npm run update:actuals
npm run update:actuals -- --overwrite
npm run update:actuals -- --from 2025-01-01 --to 2025-12-31
npm run update:actuals -- --from 2025-01-01 --to 2025-12-31 --batch none
```

`actual_6m` and `actual_1y` use the first available Naver close on or after six months / one year from each report date, with a 14-day trading-day holiday window.
The script batches by month by default to avoid Supabase API statement timeouts during large historical recalculations.

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

After a successful report sync, the script refreshes monthly report rollups only for the affected date range, then rebuilds the default analytics cache from those rollups. Pass `--skip-cache-refresh` only when you intentionally want to refresh it later.

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

For a one-time ten-year price backfill, run the Naver price sync workflow manually with `years=10`, `only_missing=true`, and a conservative `max_symbols` batch such as `300`. Increase `offset` by the same batch size for the next run.
