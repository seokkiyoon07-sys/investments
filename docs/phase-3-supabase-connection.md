# Phase 3: Supabase Connection

This phase adds the Supabase/Postgres data path while keeping the local NDJSON adapter as a fallback.

## Data Source Routing

`GET /api/reports` now chooses its backend like this:

```text
NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present
  -> Supabase RPC search_reports()

missing env vars
  -> local data/reports.ndjson fallback
```

The response includes:

```json
{
  "source": "supabase"
}
```

or:

```json
{
  "source": "local"
}
```

## Files Added

- `lib/supabase-server.ts`
  - Server-only Supabase client using the service role key.

- `lib/report-query-supabase.ts`
  - Calls the Postgres RPC function.

- `lib/report-query-router.ts`
  - Chooses Supabase or local fallback.

- `supabase/migrations/0002_search_reports_rpc.sql`
  - Adds `report_options()` and `search_reports(...)`.
  - Handles filtering, sorting, pagination, stats, and options in Postgres.

## Required Supabase Setup

Run these SQL files in order in the Supabase SQL editor:

```text
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_search_reports_rpc.sql
```

Then import:

```text
data/reports.csv
```

into:

```text
public.reports
```

After import, verify:

```sql
select count(*) from public.reports;
select * from public.report_filter_options;
select public.search_reports(p_page_size := 1);
```

Expected report count:

```text
364885
```

## Local Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Restart the dev server after creating or changing `.env.local`:

```bash
npm run dev
```

Then test:

```bash
curl "http://localhost:3000/api/reports?pageSize=25&stock=A005930&hasTp=true"
```

The response should include:

```json
"source":"supabase"
```

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` must never be used in client components.
- The current implementation only reads it in server-side API code.
- RLS is enabled in the schema. The service role key bypasses RLS for this server-side path.
- Vercel should use the same env vars, set in Project Settings.
