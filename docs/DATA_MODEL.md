# Data Model

## Core entities

### User
Verified Google identity admitted by bootstrap configuration or an invitation.

Fields:
- id
- googleSubject
- email
- name
- avatarUrl
- role: ADMIN | MEMBER

### Invitation
One-time invitation to a normalized Google email, issued or revoked by an administrator.

### Session
Server-managed session containing only a hash of the opaque token placed in the HttpOnly cookie.

### Account
Represents ICICI bank account or ICICI Amazon Pay credit card.

Fields:
- id
- userId
- name
- institution
- type: BANK_ACCOUNT | CREDIT_CARD
- lastFour
- createdAt
- updatedAt

### Import
Represents one uploaded statement file.

Fields:
- id
- userId
- accountId
- sourceType: ICICI_BANK | ICICI_AMAZON_PAY_CARD
- fileName
- fileHash
- statementFrom
- statementTo
- status: PENDING | PARSED | FAILED | COMPLETED
- totalRows
- importedRows
- duplicateRows
- failedRows
- errorMessage
- createdAt

### Transaction
Normalized financial row.

Fields:
- id
- userId
- accountId
- importId
- transactionDate
- descriptionRaw
- descriptionClean
- moneyOut
- moneyIn
- netAmount
- balance
- referenceNumber
- transactionHash
- sourceType
- paymentMethod
- createdAt

Important:
- moneyOut is positive number for debit/spend.
- moneyIn is positive number for credit/refund/income.
- netAmount = moneyIn - moneyOut.

### TransactionCategory
Categorization result.

Fields:
- id
- transactionId
- vendor
- category
- subcategory
- expenseType: EXPENSE | TRANSFER | INVESTMENT | INCOME | REFUND | REVIEW
- ruleId
- confidence
- isManual
- notes
- createdAt
- updatedAt

### Rule
User-defined matching rule.

Fields:
- id
- userId
- priority
- matchType: CONTAINS | REGEX | EXACT | STARTS_WITH
- pattern
- vendor
- category
- subcategory
- expenseType
- isActive
- createdAt
- updatedAt

## Deduplication
Create unique transaction hash from:
- accountId
- transactionDate
- descriptionClean
- moneyOut
- moneyIn
- referenceNumber if available

If referenceNumber is missing, still include normalized description and amount.

All account, import, transaction, and rule queries must include the authenticated session user's `userId`. Legacy rows from the pre-auth schema are migrated to a non-login quarantine owner and assigned to the initial administrator only by the one-time operational command.
