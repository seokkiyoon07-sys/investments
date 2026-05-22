# Phase 2: Next.js MVP

This phase adds a Next.js App Router dashboard that recreates the first practical slice of the original HTML dashboard: report filters, summary stats, sorting, pagination, and the report table.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Current Data Source

The app currently reads from:

```text
data/reports.ndjson
```

The API route caches the parsed rows in server memory after the first request:

```text
GET /api/reports
```

Example:

```bash
curl "http://localhost:3000/api/reports?pageSize=50&stock=A005930&hasTp=true"
```

This local file adapter is temporary. The next phase should replace `lib/report-query.ts` internals with Supabase/Postgres queries while keeping the API response shape stable.

## Implemented

- Next.js App Router shell.
- `GET /api/reports`.
- Date, keyword, stock, provider, author filters.
- Opinion and target-price-change chips.
- Best-only and target-price-only filters.
- Server-side sorting and pagination.
- Summary stat cards.
- Report table with original report links.

## Known Limits

- First API request loads the 221MB NDJSON file and can take a few seconds.
- This is not the intended Vercel production data path. Vercel should use Supabase/Postgres, not the local NDJSON file.
- Ranking tabs and stock detail charts are not migrated yet.
- Price data is still blocked by the missing `prices.js` source file.
