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

Period filter (top of page):
- Defaults to the current month.
- Presets: This month, Last month, Last 3 months, Last 6 months, Year to date, All time, Pick a month, Custom range.
- "Pick a month" reveals a month input and sends `?month=YYYY-MM`.
- "Custom range" reveals `from` and `to` date inputs and sends `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Month and from/to are mutually exclusive in the API and in the UI; the visible inputs are derived strictly from the selected preset.
- All summary numbers and category/vendor/source charts respect the selected period.

Primary metrics (4-up `MetricCard` grid):
- Total expense
- Bank/UPI expense
- Credit card expense
- Needs review

Excluded-from-spend card (3-up):
- Transfers excluded
- Investments excluded
- Refunds received (with net expense hint when refunds are present)

Charts:
- Category mix donut + percentage legend (top 8, with an "Other (n)" bucket for the long tail).
- Top categories list with progress bars (amount and share).
- Top vendors and By source horizontal bar charts with amount and share tables.
- Monthly trend line chart always shows the last 12 months for context, independent of the period filter.

The dashboard is the only place where these donut/percentage breakdowns appear; transactions, review, and rules pages stay table-first.

### Portfolio
Route: `/portfolio`

Use tabs for Finance OS portfolio work:

- Holdings
- Mutual Funds
- Market Data
- Risk

Patterns:

- Keep the screen dense and operational, not marketing-oriented.
- Use compact metric panels for cash, total value, allocation, and risk outputs.
- Use tables for holdings, orders, mutual funds, candles, and exposure.
- Show backend warnings and reject reasons as visible badges or alert rows.
- Label stale, missing, fallback, or low-confidence data wherever the API
  returns data-quality metadata.
- Keep broker actions read-only; never show raw broker secrets.
- Do not calculate scanner scores or trading decisions in the frontend.

### Swing Scanner
Route: `/scanner`

Patterns:

- Show the research-only disclaimer prominently: verify and place manually in Dhan.
- Provide a run-scan action wired to `POST /scanner/swing/run`.
- Load latest results from `GET /scanner/swing/candidates`.
- Use a table for candidates and a side/detail panel for entry, target, stop loss, R:R, quantity, confidence, reject reasons, and data-quality badges.
- Render backend `status`, `rejectReasons`, `warnings`, and `dataQuality` without recomputing scores client-side.
- Do not generate orders, broker actions, or auto-trading controls.
- Optional **Save to journal** on candidate detail calls `POST /trade-journal/entries/from-scanner-candidate` only after explicit user click.

### Trade Journal
Route: `/trade-journal`

Patterns:

- Show disclaimer prominently: journal does not place orders; verify and execute manually in Dhan.
- Table of entries with status/symbol filters; backend owns status rules and P&L math.
- Manual plan form for DELIVERY BUY setups (symbol, entry, SL, target, quantity, setup, notes).
- Close/review form captures exit price, reason, mistake tags, and lesson learned.
- Render stored `validationSnapshot` warnings/rejects without recomputing risk client-side.
- Do not add broker order actions or auto-trading controls.

### Tool Tester

Route: `/tools`

- Finance OS sidebar entry **Tool Tester** (authenticated session required).
- Catalog table: tool name, version, description, read-only badge.
- Select a tool to load schema-derived starter JSON in a mono `Textarea`.
- Client-side JSON syntax feedback; Run disabled until JSON parses.
- Run calls `POST /tools/:name/execute` only — no direct portfolio/scanner/research/risk bypass.
- Structured response panel: status, asOf, durationMs, auditId, data, dataQuality,
  warnings, rejectReasons; raw JSON tab for the full envelope.
- Server-side schema errors surface from rejected envelopes (`INVALID_INPUT`, issue list).
- Redacted audit history from `GET /tools/audits?limit=50` (metadata only).
- Research-only disclaimer on every visit; additional **Manual draft only** banner for
  `create_manual_super_order_plan`.
- Never store tool input or results in `localStorage` / `sessionStorage`.
- Never expose broker secrets or broker write controls.

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
- Sheet (mobile navigation drawer)
- Toast/Sonner

Do not create custom styled controls if shadcn/ui has a matching component.

## Layout
- App chrome uses the brand **Personal Finance** with tagline **Expenses & portfolio** (no bank-specific subtitle in the shell).
- Desktop (`lg+`) keeps the fixed left sidebar with grouped sections: Expenses, Finance OS, Admin.
- Mobile and tablet (`<lg`) use a full-height `Sheet` drawer: brand row with integrated close control, scrollable nav with larger tap targets, and a footer showing the signed-in user (initials avatar). Nav links close the sheet via `onClick`, not `SheetClose` wrappers (avoids stray focus rings).
- Sidebar nav ([app-sidebar-nav.tsx](apps/web/src/components/layout/app-sidebar-nav.tsx)): grouped sections with accent dot, short caption, dividers between groups, and items with rounded icon tiles tinted by section chart color (`--chart-1` expenses, `--chart-2` finance OS, `--chart-4` admin). Active item uses tinted background, inset ring, semibold label, and trailing accent dot.
- Header shows app name, page title, sign-out, and user email on `md+`; the menu button only appears below `lg`.
