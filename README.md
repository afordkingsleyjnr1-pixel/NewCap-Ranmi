# NewCap Ranmi — RE Manager Capital-Introduction BD & CRM Platform

A research-grade institutional investment manager database, BD/outreach CRM, and AI-powered
sourcing platform for a boutique capital-introduction operation (Adcapital Partners / NCM
International).

## Stack

- **Frontend/Backend:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **Database:** PostgreSQL + Prisma ORM
- **AI:** Anthropic API (Claude, with server-side web search) — powers the Classification
  Engine, firm/AUM/contact research, and Populate ("Find Similar Firms")
- **Email enrichment:** Hunter.io
- **Outreach & Calendar:** Gmail API / Microsoft Graph (Outlook) — send-as-user + Calendar,
  one OAuth connection per user powers both

## Getting started

```bash
npm install
# edit .env — fill in DATABASE_URL and any API keys you have
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Seeded login: `kweli@adcapitalpartners.com` / `changeme123`

## Configuring integrations

The platform runs and is fully navigable with zero external keys configured — Add Firm,
Populate, Find Contact, and Send Email will surface a clear "not configured" state rather than
silently failing or faking data. Add credentials to `.env` to activate each piece:

| Env var | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | Classification Engine, AUM/domain/contact research, Populate |
| `HUNTER_API_KEY` | Email finding/verification (can also be set in Settings → Account) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail send + Google Calendar |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook send + Microsoft Calendar |

See `.env` for the full list (redirect URIs, encryption key, etc).

## Background jobs

Two scheduled jobs are required in production (see `vercel.json` for Vercel Cron config, or
wire an equivalent scheduler):

- `POST /api/cron/follow-up-check` (daily) — Outreach Sent → Follow-Up Due → No Response
- `POST /api/cron/renew-watches` (daily) — renews Gmail/Outlook reply-detection subscriptions
  before they expire

Both accept a `CRON_SECRET` bearer token if set in the environment.

## Project structure

- `prisma/schema.prisma` — full data model (Section 4 of the build spec)
- `src/lib/taxonomy.ts` — fixed Strategies/Focus Areas taxonomy (single source of truth)
- `src/lib/services/` — Classification Engine, AUM research, contact discovery, Hunter.io,
  Populate, Gmail/Outlook OAuth, email send, calendar
- `src/app/api/` — REST API routes
- `src/app/(app)/` — authenticated app pages (Dashboard, Firms Database, Contacts, CRM
  Pipeline, Projects, Reports, Settings)
