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
1. User uploads statement.
2. API stores import record.
3. Parser extracts raw rows.
4. Normalizer converts rows to common transaction format.
5. Deduplication hash is generated.
6. New transactions are saved.
7. Rules are applied.
8. Unmatched transactions go to review.
9. Dashboard queries categorized transactions.

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