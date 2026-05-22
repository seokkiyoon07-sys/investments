# Phase 4: Analytics Tabs

This phase adds the dashboard aggregation tabs from the original HTML version.

## Added

- `GET /api/analytics`
- UI tabs:
  - Report list
  - Stocks
  - Providers
  - Authors
  - Monthly trend
  - Upgrade/downgrade rankings
- Bar-list panels for Top 50 rankings.
- Monthly report count chart.
- Target-price-change and opinion distributions.
- Target-price and opinion upgrade/downgrade Top 20 tables.

## Current Data Source

`/api/analytics` currently uses the local NDJSON adapter and the same filter parser as `/api/reports`.

Example:

```bash
curl "http://localhost:3000/api/analytics?stock=A005930"
```

The response includes:

```json
{
  "source": "local"
}
```

## Note

For Korean query strings in shell commands, URL-encode the value or use stock codes:

```bash
curl "http://localhost:3000/api/analytics?stock=A005930"
```

In the browser UI, Korean text input works normally.

## Next Production Step

The next backend step is adding a Supabase RPC for `/api/analytics`, similar to `search_reports(...)`, so Vercel can serve analytics without reading local NDJSON.
