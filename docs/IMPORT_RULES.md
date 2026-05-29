# Import and Categorization Rules

## Source types
Supported in MVP:
- ICICI_BANK
- ICICI_AMAZON_PAY_CARD

## ICICI Bank parser
Expected fields after cleanup:
- transaction date
- transaction remarks
- withdrawal amount
- deposit amount
- balance

Mapping:
- withdrawal amount -> moneyOut
- deposit amount -> moneyIn
- balance -> balance
- transaction remarks -> descriptionRaw

## ICICI Amazon Pay Card parser
Expected fields after cleanup:
- transaction date
- details
- amount with Dr/Cr marker
- reference number

Mapping:
- amount containing Dr -> moneyOut
- amount containing Cr -> moneyIn
- details -> descriptionRaw

## Expense type rules
EXPENSE:
- groceries
- food
- fuel
- utilities
- shopping
- health
- rent
- home setup
- subscriptions

TRANSFER:
- credit card bill payment
- self transfer
- wallet load, unless actual wallet spends are not tracked
- money moved between own accounts

INVESTMENT:
- Groww
- Zerodha
- SIP
- mutual fund
- stock purchase

INCOME:
- salary
- interest
- received amount

REFUND:
- cashback
- reversal
- merchant refund
- card refund

REVIEW:
- unknown UPI person
- unknown payment gateway
- unclear large transaction

## Default seed rules
Create these initial rules:
- `cc billpay|credit card payment|card payment` -> Credit Card Payment / Transfer / TRANSFER
- `zepto|blinkit|bigbasket|dmart|jiomart` -> Groceries / EXPENSE
- `airtel|jio|vi prepaid|broadband` -> Utilities / EXPENSE
- `drinkprime` -> Utilities / EXPENSE
- `petrol|fuel|iocl|hpcl|bharat petroleum|shell` -> Fuel / EXPENSE
- `swiggy|zomato|restaurant|cafe` -> Food Outside / EXPENSE
- `amazon|flipkart|myntra|ajio` -> Shopping / EXPENSE
- `groww|zerodha|mutual fund|sip` -> Investment / INVESTMENT
- `refund|cashback|reversal` -> Refund / REFUND
- generic `upi|imps|neft|inft` -> Manual Review / REVIEW

Specific rules must have higher priority than generic UPI rules.

## Rule lifecycle and existing transactions
Active rules are applied automatically during import. Editing a rule or marking
it inactive affects future imports immediately, but does not rewrite existing
transactions by itself.

Existing rows are updated only through an explicit apply action:
- applying a rule updates matching transactions owned by the current user
- inactive rules cannot be applied
- manual category edits are skipped
- card credits, cashback, reversals, and refunds remain REFUND/INCOME instead
  of being converted into EXPENSE by a matching purchase rule

This keeps historical data stable and avoids surprising changes after a user
has already reviewed a statement. The UI should explain this before rule edits
and show how many matching rows were updated when a rule is applied.
