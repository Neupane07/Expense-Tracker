# Project Brief

## Problem
Google Sheets is unreliable for ICICI statements because exported sheets contain logos, headers, merged cells, inconsistent row positions, DR/CR text, UPI remarks, payment gateway names, refunds, transfers, and credit card bill payments.

## Product
A simple personal finance app that imports statement files, cleans them, stores normalized transactions, applies rules, prevents duplicates, and provides dashboards.

## MVP Scope
1. Upload ICICI bank account statement.
2. Upload ICICI Amazon Pay credit card statement.
3. Parse raw file into normalized transactions.
4. Store raw import metadata.
5. Prevent duplicate transactions.
6. Apply categorization rules.
7. Show review queue.
8. Show monthly dashboard.

## Not in MVP
- Direct ICICI Bank API.
- Account Aggregator.
- Multi-user auth.
- Gmail auto-import.
- Budget prediction.
- AI categorization.

## Important accounting rule
Bank credit card bill payment is not expense. Actual card transactions are expenses.