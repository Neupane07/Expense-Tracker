# Expense Tracker Deployment

This deployment runs the React static site, NestJS API, and PostgreSQL with
Docker Compose on the VPS. Caddy is expected to be running separately on the
external Docker network named `common`.

## One-Time VPS Setup

Install Docker Engine and the Compose plugin on the VPS using Docker's
instructions for the server distribution, then prepare the deployment
directory while logged in as the non-root deployment account that will run
Docker Compose:

```bash
sudo install -d -o "$(id -un)" -g "$(id -gn)" /opt/apps/expense
docker network create common
cd /opt/apps/expense
```

Place [`docker-compose.prod.yml`](./docker-compose.prod.yml) on the VPS as
`/opt/apps/expense/compose.yml`. Using the standard `compose.yml` filename is
required because the deployment workflow runs `docker compose` from that
directory without a `-f` argument.

Create `/opt/apps/expense/.env` with restrictive permissions:

```bash
cat > /opt/apps/expense/.env <<'EOF'
POSTGRES_PASSWORD=replace_with_a_long_random_password
DATABASE_URL=postgresql://expense_user:replace_with_url_encoded_password@postgres:5432/expense_tracker?schema=public
FRONTEND_URL=https://expense.hbkbimal.xyz
CORS_ORIGINS=https://expense.hbkbimal.xyz
GOOGLE_CLIENT_ID=replace_with_google_web_client_id
GOOGLE_CLIENT_SECRET=replace_with_google_web_client_secret
GOOGLE_CALLBACK_URL=https://api.expense.hbkbimal.xyz/auth/google/callback
INITIAL_ADMIN_EMAIL=allowed.admin@example.com
AUTH_COOKIE_SECRET=replace_with_at_least_32_random_bytes
SESSION_MAX_AGE_DAYS=30
EOF
chmod 600 /opt/apps/expense/.env
```

Use the same password in both values and percent-encode special characters in
the password portion of `DATABASE_URL`. Generate `AUTH_COOKIE_SECRET` with a
cryptographically random value, for example `openssl rand -base64 48`.
`INITIAL_ADMIN_EMAIL` must be the exact Google email allowed to create the
first administrator account; it does not bypass Google's verified-email
check.

Create a Google OAuth web application with these production settings:

```text
Authorized JavaScript origin: https://expense.hbkbimal.xyz
Authorized redirect URI:      https://api.expense.hbkbimal.xyz/auth/google/callback
```

Only a verified Google identity matching `INITIAL_ADMIN_EMAIL` or an unused
administrator-issued invitation may create a session. Sessions are persisted
by the API and delivered using Secure HttpOnly cookies.

## GHCR Access

The Compose stack pulls:

```text
ghcr.io/neupane07/expense-tracker-api:latest
ghcr.io/neupane07/expense-tracker-web:latest
```

If the GitHub Container Registry packages are public, the VPS can pull them
without authentication. If they remain private, create a GitHub personal
access token with `read:packages` and log in once as the deployment account:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
```

Set `GHCR_USERNAME` to a GitHub user or machine account that has permission to
read the private packages.

## First Deploy

Pull images and start PostgreSQL first:

```bash
cd /opt/apps/expense
docker compose pull
docker compose up -d postgres
```

Apply Prisma migrations as an explicit operation. This uses the Prisma CLI
included in the versioned API image; API startup never runs migrations:

```bash
docker compose run --rm api ./apps/api/node_modules/.bin/prisma migrate deploy --config apps/api/prisma.config.ts
docker compose up -d --wait --wait-timeout 90
```

For later deployments, GitHub Actions stops application traffic, applies any
pending migrations using the newly pulled API image, and then starts the
updated services:

```bash
cd /opt/apps/expense
docker compose pull
docker compose stop api web
docker compose up -d postgres
docker compose run --rm api ./apps/api/node_modules/.bin/prisma migrate deploy --config apps/api/prisma.config.ts
docker compose up -d --wait --wait-timeout 90
docker image prune -f
```

This ordering is required for releases that introduce an authorization
boundary: an older unauthenticated API must not remain available after rows
receive their new ownership columns.

## Multi-User Migration

The multi-user migration assigns all pre-auth accounts, imports, transactions,
and rules to an internal quarantine owner with no Google identity. Those rows
cannot be read through authenticated API routes until explicitly assigned to
the configured first administrator.

When upgrading an existing deployment from the unauthenticated release, stop
the old API before migrating so it cannot serve data during the transition:

```bash
cd /opt/apps/expense
docker compose pull
docker compose stop api web
docker compose run --rm api ./apps/api/node_modules/.bin/prisma migrate deploy --config apps/api/prisma.config.ts
docker compose up -d --wait --wait-timeout 90
```

Then sign in once with the verified Google account in
`INITIAL_ADMIN_EMAIL`, and assign the quarantined legacy records:

```bash
docker compose run --rm api pnpm --dir apps/api legacy:assign-initial-admin
```

The command refuses to run until that administrator has completed verified
Google sign-in. While quarantined legacy accounts or rules exist, that initial
administrator is not provisioned with empty starter copies; assignment
restores the original records without duplicate account names. For a new empty
database the command safely reports zero legacy rows.

## Caddy Configuration

Connect the separately managed Caddy container to `common`, then configure:

```caddyfile
expense.hbkbimal.xyz {
    reverse_proxy expense-web:80
}

api.expense.hbkbimal.xyz {
    reverse_proxy expense-api:3000
}
```

Replace any placeholder `respond` blocks for these two hostnames with the
`reverse_proxy` blocks above, then reload the separately managed Caddy
deployment using its existing Compose directory:

```bash
cd /opt/proxy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Neither PostgreSQL nor either application service publishes a host port.
Caddy reaches only `expense-web` and `expense-api` on the shared external
network; PostgreSQL is available only on the private Compose network.

## Rollback

The workflow publishes each image with both `latest` and its Git commit SHA.
To roll back to a known successful SHA:

```bash
cd /opt/apps/expense
API_IMAGE_TAG=<git-sha> WEB_IMAGE_TAG=<git-sha> docker compose pull
API_IMAGE_TAG=<git-sha> WEB_IMAGE_TAG=<git-sha> docker compose up -d --wait --wait-timeout 90
```

Database schema rollbacks require a separately reviewed database recovery or
forward-fix plan; do not reverse migrations automatically.

## GitHub Actions Secrets

Set these repository secrets for `.github/workflows/deploy.yml`:

```text
VPS_HOST       VPS hostname or IP address
VPS_USER       Non-root deployment account authorized to run Docker Compose
VPS_SSH_KEY    Private SSH key authorized for VPS_USER on the VPS
```

`GITHUB_TOKEN` is provided automatically by GitHub Actions and is used to push
images to GHCR with the workflow's `packages: write` permission.

## Deployment-Specific Values

The Compose and workflow files intentionally contain the production image
namespace and public domains for this deployment:

```text
ghcr.io/neupane07/expense-tracker-*
expense.hbkbimal.xyz
api.expense.hbkbimal.xyz
```

These are deployable service addresses, not host-user assumptions. Replace
them when deploying a fork under another registry namespace or domain.
