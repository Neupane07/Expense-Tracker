# Research Module

## Purpose

The Research module stores dated, user-provided company evidence and exposes deterministic snapshots to the swing scanner, stock detail views, and future read-only MCP tools.

It is research-only. It does not place orders, scrape fragile sources, or generate AI summaries.

## Data model

### ResearchItem

User-scoped evidence record:

- symbol (required)
- instrumentId (optional, resolved when instrument mapping exists)
- title, summary (stored user text only)
- category (enum: RESULT, ORDER_WIN, CORPORATE_ACTION, REGULATORY, etc.)
- impact (POSITIVE, NEGATIVE, NEUTRAL, MIXED, UNKNOWN)
- sourceType, sourceName, sourceUrl (optional)
- publishedAt (optional), fetchedAt, asOf
- confidence (0–1 scalar for weighting metadata)
- rawPayload (optional JSON for provider metadata)
- nested ResearchEvidence rows (optional structured facts)

### ResearchSnapshot

Deterministic per-symbol rollup:

- latestEvidenceAt, hasFreshEvidence, staleReason
- positive/negative/neutral counts
- riskFlags (from RISK_FLAG category and negative items)
- summary (concatenation of stored facts only — no LLM)
- warnings (missing/stale/source quality)

### Freshness

Default stale threshold: 30 days (`RESEARCH_STALE_DAYS` env override).

## Services

```text
apps/api/src/research/
  research-items.service.ts
  research-snapshot.service.ts
  research-ingestion.service.ts
  research-quality.service.ts
  providers/
    research-provider.interface.ts
    manual-research.provider.ts
    official-filings.provider.ts   # placeholder
    news.provider.ts               # placeholder
```

## API (authenticated)

- `GET /research/items?symbol=&category=&impact=`
- `POST /research/items`
- `DELETE /research/items/:id` (user-owned only)
- `GET /research/:symbol`
- `POST /research/:symbol/snapshot`

## Scanner integration

Each swing candidate includes:

- `researchFreshness` (`fresh` | `stale` | `missing`)
- `latestResearchAt`
- `researchWarnings`
- `evidenceCount`
- `riskFlags`

Confidence caps:

- `NO_FRESH_NEWS_OR_FILING_CHECK` when no fresh evidence exists
- `STALE_RESEARCH_EVIDENCE` when evidence exists but is older than threshold

## UI

- `/research` — symbol lookup, snapshot, items table, manual add form, warnings, data quality
- `/scanner` candidate detail — research status + link to `/research?symbol=...`

## Boundaries

- No MCP in this phase
- No order placement
- No LLM-generated facts as source data
- No invented summaries beyond stored input
- Official NSE/BSE/news providers remain stubs until reliable APIs exist
