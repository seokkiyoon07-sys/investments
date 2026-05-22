# Phase 1: Data Migration Base

This folder contains the first migration layer for converting the current single-file dashboard into a Supabase/Postgres-backed Next.js app.

## What Is Included

- `supabase/migrations/0001_initial_schema.sql`
  - Creates `reports` and `stock_prices`.
  - Adds indexes for date, stock, provider, author, opinion, target-price-change, and simple text search.
  - Enables RLS. The future Next.js server should use the Supabase service role key from server-only code.

- `scripts/profile-dashboard-payload.mjs`
  - Reads the existing `../dashboard (1).html`.
  - Extracts the embedded JSON payload.
  - Normalizes short keys like `d`, `g`, `n`, `tp` into database field names.
  - Prints basic counts for validation.

- `scripts/export-dashboard-payload.mjs`
  - Exports normalized report rows to `data/reports.ndjson` by default.
  - Can also export CSV with `--format csv`.

## Commands

From this directory:

```bash
npm run data:profile
npm run data:export
npm run data:export -- --format csv --output data/reports.csv
```

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial_schema.sql` in the Supabase SQL editor, or with the Supabase CLI later.
3. Export the report data:

```bash
npm run data:export -- --format csv --output data/reports.csv
```

4. Import `data/reports.csv` into `public.reports`.

Recommended Supabase dashboard flow:

- Open Table Editor.
- Select `reports`.
- Use Import data from CSV.
- Upload `data/reports.csv`.
- Keep the CSV header mapping as-is.

Validation query after import:

```sql
select * from public.report_filter_options;
select count(*) from public.reports;
select min(report_date), max(report_date) from public.reports;
```

For a more robust production import, the next phase should add a server-side bulk import script using `DATABASE_URL` and `COPY`.

## Notes

- The current dashboard references `prices.js`, but that file is not present beside the HTML file. The `stock_prices` table is ready, but price import needs the missing source file or a new price loader.
- `summary` is stored as `jsonb` so CSV import stays simple and the app can render it directly.
- `source_key` is a SHA-256 hash of stable report fields and is used to prevent duplicate imports.
