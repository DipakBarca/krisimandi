# KrisiMandi

Marketplace that connects farmers in Nepal with buyers. Farmers post a harvest and its pickup location; buyers make a direct offer or bid in a timed auction. Pilot area: Nawalpur village, Lalbandi Municipality ward 1, Sarlahi district (Madhesh Province). Web app first (PWA), native mobile app later on the same API.

## Layout

```
packages/db     Prisma schema, migrations, seed data (PostgreSQL + PostGIS)
apps/api        NestJS API: sign-in, profiles, listings
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
cp .env.example apps/api/.env
npm run build -w @krisimandi/api && npm start -w @krisimandi/api   # http://localhost:4000
npm test -w @krisimandi/api   # needs the migrated, seeded database
```

With `SMS_PROVIDER=console` the sign-in code is printed in the API log instead of being sent.

## API (phase 1)

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | /auth/otp/request | anyone | Send a 6-digit code by SMS to a Nepali mobile number |
| POST | /auth/otp/verify | anyone | Check the code; returns access and refresh tokens |
| POST | /auth/refresh, /auth/logout | anyone | Rotate or revoke a refresh token |
| GET, PATCH | /me | signed in | Profile: name, Farmer/Buyer roles, language, ward, village |
| POST | /me/photo | signed in | Profile photo |
| POST, GET | /me/verification-docs | signed in | Upload citizenship/PAN for the verified badge |
| GET, PATCH | /admin/verification-docs | admin | Review queue; approving sets the badge |
| GET | /users/:id | anyone | Public profile (no phone number) |
| GET | /locations/..., /crops, /units | anyone | Lookup lists in Nepali and English |
| GET | /listings, /listings/:id | anyone | Active listings; exact location only for the owner |
| POST | /listings | farmer | Fixed-price or auction listing |
| PATCH, DELETE | /listings/:id | owner | Edit or remove |
| POST | /listings/:id/pause, resume, sold, relist | owner | Change status |
| POST, DELETE | /listings/:id/photos | owner | Up to 6 photos, stored as WebP |
| GET | /me/listings | farmer | The farmer's own listings |

Errors return a stable `code` (for example `OTP_INVALID`) that the web app translates.

## Pilot decisions

- Nawalpur village in Sarlahi is the pilot area; Nepali and English.
- Free during the pilot.
- Every deal goes through an order; a deal without one counts as cancelled.
- Each farmer posts under their own account.
- Parties settle disputes themselves; either can file a complaint and an admin follows up.
- Payments happen off the platform for the first release.
