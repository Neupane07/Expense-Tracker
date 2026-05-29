# Expense Module

## Purpose

The Expense module imports bank/card statement files, normalizes transaction rows, deduplicates transactions, applies categorization rules, and powers the expense dashboard.

This module is already functional and must not break during Finance OS migration.

## Current Backend Modules

Current expense-related modules:

```text
src/
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
```

Future target location:

```text
src/
  expenses/
    imports/
    parsers/
    transactions/
    rules/
    dashboard/
```

Do not move existing files until there are tests or enough manual verification to confirm behavior is unchanged.

## Data Flow

- A verified, invited Google identity establishes an opaque server session in an HttpOnly cookie.
- Authenticated user uploads statement.
- API stores a user-owned import record.
- Parser extracts raw rows.
- Normalizer converts rows to common transaction format.
- Deduplication hash is generated.
- New user-owned transactions are saved.
- That user's active rules are applied.
- Unmatched transactions go to review.
- Dashboard queries that user's categorized transactions.

## Authentication Boundary

- `/health`, Google initiation/callback, and session discovery are the only public API surfaces.
- Financial controllers require a persisted server session and derive `userId` from it.
- The browser receives an opaque Secure HttpOnly session cookie, never an application token in local storage.
- Administrator invitation routes require both an authenticated session and ADMIN role.

## Parser Responsibility

Parser only extracts:

- transactionDate
- rawDescription
- moneyOut
- moneyIn
- balance
- referenceNumber
- rawRowJson

Parser must not decide final category.

## Normalizer Responsibility

Normalizer converts parser output into the common transaction format.

Responsibilities:

- normalize dates
- normalize debit/credit values
- trim/clean descriptions
- generate deduplication fields
- preserve raw row JSON for debugging

## Rule Engine Responsibility

Rule engine decides:

- vendor
- category
- subcategory
- expenseType
- confidence

Rule edits and inactive status are forward-looking for imports.

Existing transactions are not rewritten automatically.

The API may expose an explicit apply operation for a single active rule.

That operation must:

- skip manual categorizations
- preserve protected automatic categories
- preserve refunds
- preserve cashback
- preserve reversals
- preserve income
- preserve credit card payment transfers

## Safety Requirements

Any future Finance OS changes must not break:

- existing imports
- existing parsers
- existing transaction dashboard
- existing rules behavior
- existing authentication behavior

Before merging Finance OS foundation work, verify:

- Can login
- Can upload statement
- Can parse statement
- Can view transactions
- Can create/update rules
- Can see dashboard
