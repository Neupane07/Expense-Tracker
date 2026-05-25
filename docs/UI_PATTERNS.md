# UI Patterns

## UI stack
- React + TypeScript
- shadcn/ui components
- Tailwind utility classes
- Recharts for charts later
- TanStack Table can be used for transaction tables

## Design principles
- Clean dashboard, not fancy finance app.
- Always show import correctness stats.
- Make review workflow fast.
- Avoid hiding raw transaction description.
- Category editing should be obvious.

## Main pages

### Upload Statement
Route: `/imports/new`

Fields:
- Account/source selector
- File input
- Import button

After import, show:
- total rows found
- rows imported
- duplicates skipped
- rows needing review
- failed rows

### Transactions
Route: `/transactions`

Table columns:
- Date
- Source
- Description
- Money Out
- Money In
- Vendor
- Category
- Expense Type
- Rule Applied

Filters:
- Month
- Source
- Category
- Expense Type
- Review only
- Search

### Review Queue
Route: `/review`

Show transactions with expenseType = REVIEW.

Actions:
- set vendor
- set category
- set subcategory
- set expense type
- create rule from transaction
- apply to similar transactions

### Rules
Route: `/rules`

Fields:
- Priority
- Match type
- Pattern
- Vendor
- Category
- Subcategory
- Expense type
- Active/inactive

### Dashboard
Route: `/dashboard`

Cards:
- Total actual expense
- Bank/UPI expense
- Credit card expense
- Transfers excluded
- Investments excluded
- Review amount

Charts:
- Category-wise spend
- Vendor-wise spend
- Source-wise spend
- Monthly trend

## shadcn/ui usage
Use these components first:
- Button
- Card
- Input
- Select
- Table
- Badge
- Dialog
- Dropdown Menu
- Tabs
- Toast/Sonner

Do not create custom styled controls if shadcn/ui has a matching component.