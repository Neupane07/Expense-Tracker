# AGENTS.md

## Project
Personal expense tracker for Indian bank and credit card statements.

Stack:
- Frontend: Vite + React + TypeScript
- UI: shadcn/ui + Tailwind
- Backend: NestJS
- ORM: Prisma
- DB: PostgreSQL via Docker
- Package manager: pnpm

## Main goal
Allow user to upload ICICI bank and ICICI Amazon Pay credit card statements, clean and normalize transactions, store them without duplicates, apply user-defined rules, and show expense dashboards.

## Commands
- Install: `pnpm install`
- Start DB: `docker compose up -d`
- Start API: `pnpm dev:api`
- Start Web: `pnpm dev:web`
- Prisma migrate: `cd apps/api && pnpm prisma migrate dev`
- Prisma studio: `cd apps/api && pnpm prisma studio`

## Rules for agents
- Do not implement direct ICICI API integration in MVP.
- Do not build dashboard before import correctness.
- Always preserve raw import data.
- Never classify every debit as expense.
- Credit card bill payment from bank account is TRANSFER, not EXPENSE.
- Credit card purchases are actual expenses.
- Use small focused modules.
- Backend owns parsing, validation, deduplication, and categorization.
- Frontend should not contain business rules except UI labels.
- Prefer explicit DTOs and Zod validation for uploaded/parsed data.
- Keep Prisma schema as the source of truth for database models.

## Prisma setup rules
- Use current Prisma setup.
- Do not put `url = env("DATABASE_URL")` inside `schema.prisma`.
- Database URL belongs in `prisma.config.ts`.
- Use `generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`.
- Import PrismaClient from `src/generated/prisma/client`, not from `@prisma/client`.
- Use `@prisma/adapter-pg` and instantiate PrismaClient with `new PrismaClient({ adapter })`.
- Use ConfigModule globally in NestJS.

## Read before coding
- `docs/PROJECT_BRIEF.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/IMPORT_RULES.md`
- `docs/UI_PATTERNS.md`