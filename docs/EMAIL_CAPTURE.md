# Email capture and historical expense accounts

## Deployment

Apply migrations `20261004120000_expense_email_history` and
`20261004130000_merchant_aliases` using the normal deployment
procedure. It is additive: account/transaction IDs and manual categories remain.
Automatic legacy card credits are flagged for review, not silently recategorized.

Set `EXPENSE_DATA_KEY` and `EXPENSE_TOKEN_KEY` to independent 32-byte hexadecimal
keys (`openssl rand -hex 32`). The data key is REQUIRED for new statement uploads,
even when Gmail is disabled, because accepted source files are now encrypted.
Existing historical reads need no key. Back up keys separately from the database;
losing them makes retained evidence/passwords/tokens unreadable. V1 ciphertext is
versioned; changing either key without re-encrypting its stored payloads is not a
supported rotation procedure.

The production Compose file includes `expense-worker`, using the API image and a
separate Nest application context. Stop API, web, and worker before migrations.
The worker is idle when `EXPENSE_GMAIL_ENABLED=false`. Locally run `pnpm dev:worker`
after configuring the API environment. Do not expose a worker HTTP port.

## Gmail setup

The operator configures a separate Google OAuth application/project for expense
mail so revocation does not affect application login. Enable the Gmail API; set
`EXPENSE_GOOGLE_CLIENT_ID`, `EXPENSE_GOOGLE_CLIENT_SECRET`, and
`EXPENSE_GOOGLE_CALLBACK_URL` (production API URL + `/email-connections/callback`).
Register that exact callback in Google. The callback requires the signed-in app
session that initiated consent.

Set `EXPENSE_GMAIL_ENABLED=true` for the pilot. `EXPENSE_GMAIL_PILOT_ONLY=true`
restricts new connections and backfills to `INITIAL_ADMIN_EMAIL`. Users connect
through **Email intake**, preview 90 days (or select another window), map accounts,
and enable capture. Gmail grants mailbox-wide read access; filtering is an
application control, not a restricted Google permission. No send/modify scopes.

Google classifies `gmail.readonly` as a [restricted scope](https://developers.google.com/workspace/gmail/api/auth/scopes).
This deployment retains restricted data on a server, so broader distribution
requires assessing restricted-scope verification and the security assessment.
Google lists personal-use and development/testing exceptions; an invite-only
service is not automatically exempt. Confirm the deployment's eligibility before
expanding the pilot, and complete the applicable annual assessment if required.
See [Google's verification requirements and exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). Testing-mode token expiration/revocation appears as a
reconnect requirement; do not promise permanent connectivity in test mode.

## Template validation and known limits

`EXPENSE_VALIDATED_TEMPLATES` defaults to empty. Candidate parser versions are
`icici-alert-v1` and `icici-statement-v1`. These are NOT production-validated:
checked-in PDF fixtures and alert examples are synthetic. Obtain anonymized real
ICICI bank/Amazon Pay card messages and complete statement cycles, verify exact
amount/date/direction extraction and reconciliation, then enable only validated
versions. Manual preview confirmation is available for successfully extracted
rows. Unsupported templates never create transactions.

The first PDF adapter supports text statements with explicit Dr/Cr row markers
and numeric dates. Other table layouts and image-only PDFs are held for adapter
work. It does not claim arbitrary ICICI PDF coverage. Statement coverage is
reconciled only with verified periods, opening/closing balances, matching debit
and credit totals, validated parser version, and no unresolved observations.

Sender discovery currently covers `alerts@icicibank.com`,
`credit_cards@icicibank.com`, and `customercare@icicibank.com`, with transaction/
statement subject filters and Gmail receiver DMARC checks. Validate sender and
subject variations against real samples before expanding this versioned list.
An exact sender mismatch or failed authentication is not accepted. No links,
remote images, or email instructions are followed. Oversized or missing PDF attachments appear as actionable intake failures and are not
parsed; do not use email sync success as evidence of complete account coverage.

## Processing and control

- Polls run every 15 minutes with a seven-day overlap from the successful watermark.
  Historical scans run newest month first; pagination is durable across worker
  restarts and pause/resume. Explicit rescans
  cover old messages subsequently moved/imported into Gmail.
- PostgreSQL jobs use leases, renewal, bounded sequential execution, and exponential
  retry. Connection generations invalidate old jobs after pause/disconnect.
- Account identifiers are user-confirmed, source-specific, and dated. Colliding
  identifiers require manual mapping; last four digits alone never create accounts.
- User-owned merchant aliases normalize naming variations for future imports.
  Scoped remembered rules can be edited or disabled in Rules. Undo preserves later
  transaction edits and reports later rule edits as conflicts.
- Statement evidence confirms an alert rather than creating a second expense.
  Ambiguous matches remain in intake. Equal purchases within a statement remain
  distinct. Shared references can link transfer counterparts and refunds.
- Pause/disconnect retain financial history. Disconnect revokes and removes local
  credentials; if revocation fails, the UI instructs revocation in Google settings.
- Source deletion removes encrypted bytes, parsed/raw observation content, and the
  associated remembered statement password, retaining transaction history and
  minimal source/hash suppression records. Database backups follow operator
  retention; deletion does not rewrite already-created backups.
- Never log email bodies, passwords, refresh tokens, or provider response bodies.
  Intake exposes document failures and connection status without credentials.

## Tests

`pnpm test`, `pnpm typecheck`, and `pnpm build` cover normal checks. For real DB
integration use a disposable database named `expense_email_test`, apply migrations,
and run:

```sh
EXPENSE_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/expense_email_test pnpm --filter api test:expense:integration
```

Integration tests create synthetic users/accounts; run them only in a disposable
database. They are skipped when the explicit test URL is absent. Test coverage
includes ownership, deduplication, statement matching, manual protection, learned
rules, undo conflicts, account lifecycle, pagination, and deletion suppression.
Encrypted PDF fixtures use the public test password `synthetic-test-password`.

## Release gate

Application code and synthetic integration checks are available; production Gmail
posting is not yet validated. Before pilot activation, supply real anonymized
fixtures covering purchases, bank debits/credits, repayments, refunds, repeated
equal purchases, replacement cards, password failures, and complete statement
cycles. Adapt the candidate adapters to those exact layouts, assert complete
row counts/totals, then enable their version IDs. Keep all other versions gated.
No production database migration or OAuth connection is performed by this change.

References: [server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Gmail message search](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
[PDF.js document API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

## Verification record

The implementation was checked with 209 backend unit tests on the isolated main-based PR, 39 API/integration
tests (including disposable PostgreSQL and a legacy-data migration fixture), and
25 frontend interaction/unit tests. Workspace type checks, production builds,
and changed-file lint checks passed. These synthetic checks do not replace the
real-statement pilot gate above.

## Existing CI/CD: deployment commands

Do these prerequisites **before merging the PR**. A merge into `main` triggers
Build and Deploy, publishes SHA-tagged API/web images, runs migrations, and starts
the API, web and worker. The workflow stops before taking the app down if the new
Compose service or encryption configuration is missing.

From a checkout of the PR, copy the Compose definition to the existing VPS:

```sh
export VPS_TARGET='deploy-user@your-vps'
scp deploy/docker-compose.prod.yml "$VPS_TARGET:/opt/apps/expense/compose.email-next.yml"
ssh "$VPS_TARGET"
```

On the VPS, as the existing deployment user:

```sh
cd /opt/apps/expense
umask 077
cp compose.yml "compose.before-email.$(date +%Y%m%d-%H%M%S).yml"
# Back up the database; store encryption keys in a separate secure backup.
docker compose exec -T postgres pg_dump -U expense_user -d expense_tracker -Fc > "before-email.$(date +%Y%m%d-%H%M%S).dump"
mv compose.email-next.yml compose.yml
python3 - <<'PYENV'
from pathlib import Path
import secrets
p = Path('.env')
text = p.read_text()
keys = {line.split('=', 1)[0].strip() for line in text.splitlines() if '=' in line and not line.lstrip().startswith('#')}
add = {}
for name in ('EXPENSE_DATA_KEY', 'EXPENSE_TOKEN_KEY'):
    if name not in keys:
        add[name] = secrets.token_hex(32)
for name, value in {'EXPENSE_GMAIL_ENABLED': 'false', 'EXPENSE_GMAIL_PILOT_ONLY': 'true', 'EXPENSE_VALIDATED_TEMPLATES': ''}.items():
    if name not in keys:
        add[name] = value
if add:
    p.write_text(text.rstrip('\n') + '\n' + ''.join(f'{key}={value}\n' for key, value in add.items()))
p.chmod(0o600)
print('Added missing expense configuration; existing keys were preserved. No secrets printed.')
PYENV
docker compose config --quiet
```

The snippet requires Python 3 on the VPS and never replaces existing entries.
If existing key entries are empty/placeholders, set them to independent values
from `openssl rand -hex 32` before first use. Never replace keys that already
protect retained data. Back up the final keys separately from database backups.

Return to the local PR checkout and merge when ready:

```sh
gh pr merge --squash --delete-branch
gh run list --workflow deploy.yml --branch main --limit 3
# Use the run ID for the merge commit above.
gh run watch RUN_ID --exit-status
```

There is no need to run migrations or rebuild the images manually. After the
workflow succeeds, inspect the services on the VPS:

```sh
cd /opt/apps/expense
docker compose ps
docker compose logs --tail=80 api expense-worker
curl -fsS https://api.expense.hbkbimal.xyz/health
```

## Google Cloud and user consent, step by step

1. Create a **separate Google Cloud project** for expense-mail access. Keep the
   existing login project and `GOOGLE_*` environment values unchanged.
2. Enable **Gmail API**. Configure Google Auth Platform branding/support details
   and Audience. For an external pilot, use **Testing** and add the Gmail account
   that will connect under Test users. Add the production app's domain when the
   console requests authorized domains.
3. In Data Access, add `openid`, `https://www.googleapis.com/auth/userinfo.email`,
   and `https://www.googleapis.com/auth/gmail.readonly`. The app requests the
   equivalent `openid email` identity scopes plus Gmail read-only.
4. Create an OAuth client of type **Web application**. Add this exact authorized
   redirect URI (the connector exchanges credentials on the server):
   `https://api.expense.hbkbimal.xyz/email-connections/callback`.
   Browser JavaScript origins are not needed for this server-side flow.
5. Edit `/opt/apps/expense/.env` on the VPS using a private editor session. Add:

   ```dotenv
   EXPENSE_GOOGLE_CLIENT_ID=your-new-web-client-id
   EXPENSE_GOOGLE_CLIENT_SECRET=your-new-web-client-secret
   EXPENSE_GOOGLE_CALLBACK_URL=https://api.expense.hbkbimal.xyz/email-connections/callback
   EXPENSE_GMAIL_ENABLED=true
   EXPENSE_GMAIL_PILOT_ONLY=true
   EXPENSE_VALIDATED_TEMPLATES=
   ```

   Retain the two generated encryption keys. `INITIAL_ADMIN_EMAIL` identifies
   the app user allowed to connect during the pilot; the Google test-user entry
   identifies the mailbox account consenting to Gmail access.
6. Recreate API and worker to load the changed environment:

   ```sh
   cd /opt/apps/expense
   docker compose up -d --no-deps --force-recreate api expense-worker
   ```

7. Sign into the application normally, open **Email intake → Connect Gmail**, and
   complete Google consent. Choose **Preview / scan history** (90 days by default), inspect
   the preview, create/confirm account mappings, and then enable capture. The
   application stores refresh tokens server-side; users never copy tokens or
   create their own OAuth client.

Gmail read permission covers the mailbox; supported-message filtering happens
inside this application. In Google's external Testing mode, refresh tokens for
these scopes normally expire after seven days, so reconnecting may be necessary
([Google token expiration documentation](https://developers.google.com/identity/protocols/oauth2#expiration)).
Keep `EXPENSE_VALIDATED_TEMPLATES` empty until the real-template release gate is
satisfied. Connecting Gmail enables collection/preview; it does not establish
that the candidate parsers are ready for automatic financial posting.
