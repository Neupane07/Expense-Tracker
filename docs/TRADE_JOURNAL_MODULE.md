# Trade Journal Module

## Purpose

The Trade Journal module captures user-authored swing trade plans and post-trade reviews.

It does not place, modify, or cancel broker orders. Users execute trades manually in Dhan and use the journal to document intent, levels, and lessons learned.

## Boundaries

Allowed:

- Manual DELIVERY BUY trade plans
- Status tracking: `PLANNED`, `ACTIVE`, `CLOSED`, `CANCELLED`
- Post-trade exit review fields (exit price, reason, mistake tags, lesson)
- Optional creation from a saved swing scanner candidate (explicit user action)
- Risk validation snapshot at plan creation (shared `TradeValidationService`, no duplicated risk math)
- Symbol verification via `InstrumentsService`

Not allowed:

- Order placement, modification, or cancellation
- Auto-creating journal entries from scanner runs
- MTF, leverage, intraday, or F&O products
- Broker secret exposure to the frontend
- MCP tools (later phase)

## Data model

`TradeJournalEntry` (user-scoped):

| Field | Description |
| --- | --- |
| `symbol` | Verified trading symbol |
| `side` | `BUY` in v1 |
| `product` | `DELIVERY` only in v1 |
| `plannedEntry`, `plannedTarget`, `plannedStopLoss` | Planned levels |
| `quantity` | Planned quantity |
| `setupType` | Optional setup label (e.g. `BREAKOUT`) |
| `status` | `PLANNED` \| `ACTIVE` \| `CLOSED` \| `CANCELLED` |
| `notes` | Free-form plan notes |
| `source` | `MANUAL` or `FROM_SCANNER` |
| `swingScanRunId` | Optional scanner run reference (id only) |
| `scannerCandidateKey` | Optional `SYMBOL::SETUP` reference |
| `validationSnapshot` | Warnings/rejects from risk validation at creation |
| `dataQuality` | Market-data quality metadata when checked |
| `exitPrice`, `exitAt`, `actualPnl` | Recorded on close |
| `exitReason`, `mistakeTags`, `lessonLearned` | Post-trade review |
| `closedAt`, `cancelledAt` | Lifecycle timestamps |

Scanner math is not denormalized onto the entry; only ids/keys and user-editable plan fields are stored.

## API

All routes require session authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/trade-journal` | Module status and disclaimer |
| `GET` | `/trade-journal/entries` | List entries (`status`, `symbol`, `dateFrom`, `dateTo`) |
| `GET` | `/trade-journal/entries/:id` | Entry detail |
| `POST` | `/trade-journal/entries` | Create manual plan |
| `POST` | `/trade-journal/entries/from-scanner-candidate` | Create plan from scanner candidate |
| `PATCH` | `/trade-journal/entries/:id` | Update plan or close trade |
| `DELETE` | `/trade-journal/entries/:id` | Delete `PLANNED` or `CANCELLED` only |

### Close trade

`PATCH` with `status: "CLOSED"` and `exitPrice` (required). Optional: `exitAt`, `exitReason`, `mistakeTags`, `lessonLearned`.

`actualPnl` is computed server-side for long DELIVERY: `(exitPrice - plannedEntry) * quantity`.

### From scanner

```json
{
  "symbol": "INFY",
  "setupType": "BREAKOUT",
  "swingScanRunId": "optional-run-id"
}
```

Defaults come from the candidate (entry, target, stop loss, suggested quantity). Risk validation runs once; snapshot is stored on the entry.

## Frontend

Route: `/trade-journal`

- Table of entries with filters
- Manual plan form
- Close/review form
- Scanner candidate detail includes **Save to journal** (calls from-scanner endpoint)
- Prominent disclaimer: journal does not place orders; verify in Dhan

## Status rules

- Plan fields editable only while `PLANNED`
- `ACTIVE` entries: notes/review fields only (not plan levels)
- Close requires `exitPrice`
- Delete only `PLANNED` or `CANCELLED`
