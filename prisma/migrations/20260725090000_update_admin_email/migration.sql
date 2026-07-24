-- One-time data fixup: the platform's bootstrapped admin/account-owner
-- login was hardcoded to a placeholder email at build time. Renaming the
-- actual row here (idempotent — a no-op once already applied, and a no-op
-- if that placeholder account was never created in this environment) since
-- the code-level defaults (src/lib/session.ts, prisma/seed.ts) only affect
-- brand-new bootstraps, not the account already in use.
UPDATE "users"
SET "email" = 'sydney@adcapital-partners.com', "name" = 'Sydney'
WHERE "email" = 'kweli@adcapitalpartners.com';
