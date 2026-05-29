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

### Sign In
Route: `/sign-in`

- Google sign-in action only.
- Show invite-only access messaging and an unauthorized-invite state.
- Do not mount or query financial pages until session discovery confirms authentication.

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
- set vendor from suggestions or enter a new value
- set category from suggestions or enter a new value
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

Actions:
- add starter rules when no rules exist
- add missing starter rules later without duplicating existing patterns
- edit rule details and active status
- apply one active rule to existing matching transactions

Rule edit UI must explain that edits and inactive status affect future imports
immediately, while existing transactions change only through the explicit apply
action. Applying a rule should report matched and updated row counts and should
make clear that manual review edits are skipped.

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

### Invitations
Route: `/admin/invitations`

- Visible only to administrators.
- Create a one-time Google email invitation with MEMBER or ADMIN role.
- Show accepted/revoked status and revoke unused invitations.

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
