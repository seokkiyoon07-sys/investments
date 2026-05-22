# Phase 5: Supabase Analytics RPC

This phase makes `/api/analytics` production-ready for Supabase/Postgres.

## Added

- `supabase/migrations/0003_report_analytics_rpc.sql`
- `lib/report-analytics-supabase.ts`
- `lib/report-analytics-router.ts`

## Runtime Behavior

`GET /api/analytics` now routes like this:

```text
Supabase env vars present
  -> public.report_analytics(...)
  -> fallback to local NDJSON if RPC/query fails

Supabase env vars missing
  -> local NDJSON
```

The fallback response includes:

```json
{
  "source": "local",
  "warning": "Supabase report_analytics failed: ..."
}
```

Once `0003_report_analytics_rpc.sql` is applied in Supabase, the response should include:

```json
{
  "source": "supabase"
}
```

## Supabase SQL Order

Run in Supabase SQL Editor:

```text
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_search_reports_rpc.sql
supabase/migrations/0003_report_analytics_rpc.sql
```

Then import:

```text
data/reports.csv
```

into:

```text
public.reports
```

## Validation

```sql
select count(*) from public.reports;
select public.search_reports(p_page_size := 1);
select public.report_analytics(p_stock := 'A005930');
```

Expected count:

```text
364885
```
