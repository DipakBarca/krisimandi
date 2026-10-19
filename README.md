# KrisiMandi

Marketplace that connects farmers in Nepal with buyers. Farmers post a harvest and its pickup location; buyers make a direct offer or bid in a timed auction. Pilot area: Nawalpur village, Lalbandi Municipality ward 1, Sarlahi district (Madhesh Province). Web app first (PWA), native mobile app later on the same API.

## Layout

```
packages/db     Prisma schema, migrations, seed data (PostgreSQL + PostGIS)
apps/api        NestJS API (phase 1)
apps/web        Next.js PWA (phase 1)
```

## Run locally

Needs Node 20+ and Docker.

```bash
cp .env.example packages/db/.env
npm install
npm run db:up        # Postgres with PostGIS, and Redis
npm run db:migrate   # create tables
npm run db:seed      # Sarlahi local units and wards, units, crops
```

## Pilot decisions

- Nawalpur village in Sarlahi is the pilot area; Nepali and English.
- Free during the pilot.
- Every deal goes through an order; a deal without one counts as cancelled.
- Each farmer posts under their own account.
- Parties settle disputes themselves; either can file a complaint and an admin follows up.
- Payments happen off the platform for the first release.
