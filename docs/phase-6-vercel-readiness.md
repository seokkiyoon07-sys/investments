# Phase 6 - Vercel Readiness

## Goal

Prepare the Next.js dashboard for Vercel deployment without shipping the large local export files.

## Production Runtime

Production must use Supabase. Local NDJSON fallback is available only in development.

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `DATABASE_URL`

## Deployment Exclusions

`.vercelignore` excludes:

- `data/`
- `docs/`
- `scripts/`
- `supabase/`

This keeps the deployment package small and prevents the local 100MB+ exports from being bundled.

## Health Check

After deployment, open:

```txt
/api/health
```

Expected result:

```json
{
  "ok": true,
  "supabaseConfigured": true,
  "nodeEnv": "production",
  "reportsCount": 364885
}
```

If `ok` is false, check the Vercel env vars first, then confirm that the Supabase `reports` table was imported.
The health check also verifies that the `search_reports` RPC exists.
