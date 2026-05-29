# Architecture

## Apps
- `apps/web`: React frontend.
- `apps/api`: NestJS backend.

## Backend modules
Use this module structure:

src/
  app.module.ts
  prisma/
    prisma.module.ts
    prisma.service.ts
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    session-auth.guard.ts
  imports/
    imports.module.ts
    imports.controller.ts
    imports.service.ts
    parsers/
      statement-parser.interface.ts
      icici-bank.parser.ts
      icici-amazon-card.parser.ts
  transactions/
    transactions.module.ts
    transactions.controller.ts
    transactions.service.ts
  rules/
    rules.module.ts
    rules.controller.ts
    rules.service.ts
  dashboard/
    dashboard.module.ts
    dashboard.controller.ts
    dashboard.service.ts

## Data flow
1. A verified, invited Google identity establishes an opaque server session in an HttpOnly cookie.
2. Authenticated user uploads statement.
3. API stores a user-owned import record.
4. Parser extracts raw rows.
5. Normalizer converts rows to common transaction format.
6. Deduplication hash is generated.
7. New user-owned transactions are saved.
8. That user's active rules are applied.
9. Unmatched transactions go to review.
10. Dashboard queries that user's categorized transactions.

## Authentication boundary
- `/health`, Google initiation/callback, and session discovery are the only public API surfaces.
- Financial controllers require a persisted server session and derive `userId` from it.
- The browser receives an opaque Secure HttpOnly session cookie, never an application token in local storage.
- Administrator invitation routes require both an authenticated session and `ADMIN` role.

## Parser responsibility
Parser only extracts:
- transactionDate
- rawDescription
- moneyOut
- moneyIn
- balance
- referenceNumber
- rawRowJson

Parser must not decide final category.

## Rule engine responsibility
Rule engine decides:
- vendor
- category
- subcategory
- expenseType
- confidence

Rule edits and inactive status are forward-looking for imports. Existing
transactions are not rewritten automatically; the API exposes an explicit apply
operation for a single active rule. That operation must skip manual
categorizations and preserve protected automatic categories such as refunds,
cashback, reversals, income, and credit card payment transfers.
