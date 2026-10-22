# KrisiMandi

Marketplace that connects farmers in Nepal with buyers. Farmers post a harvest and its pickup location; buyers make a direct offer or bid in a timed auction. Pilot area: Nawalpur village, Lalbandi Municipality ward 1, Sarlahi district (Madhesh Province). Web app first (PWA), native mobile app later on the same API.

## Layout

```
packages/db     Prisma schema, migrations, seed data (PostgreSQL + PostGIS)
apps/api        NestJS API: sign-in, profiles, listings, search, alerts, offers, auctions, chat
apps/web        Next.js PWA in Nepali and English
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

Web app (second terminal):

```bash
cp apps/web/.env.example apps/web/.env.local
npm run dev -w @krisimandi/web   # http://localhost:3000
```

With `SMS_PROVIDER=console` the sign-in code is printed in the API log instead of being sent.

To make someone an admin, they sign up in the app first, then:

```bash
npm run db:make-admin -- 98XXXXXXXX            # add the admin role
npm run db:make-admin -- 98XXXXXXXX --remove   # take it away
```

Admins see an Admin link in the header for verification, complaints, users, the crop list and the audit log.

## Production

`docs/LAUNCH.md` is the step-by-step guide for putting the pilot online: one server running Docker with the
database, API, web app, automatic HTTPS (Caddy) and daily backups, all defined in `deploy/compose.yml`.
The API refuses to start in production without real SMS (`SMS_PROVIDER=sparrow`). `GET /health` is for uptime
monitors, and `ALERT_WEBHOOK_URL` sends server errors, failed SMS and failed jobs to Slack or Discord.

## API (phases 1 to 4)

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
| GET | /listings | anyone | Search: `q`, `cropId`, `municipalityId`, `wardId`, `saleMode`, `minPrice`, `maxPrice`, `lat`+`lng`+`radiusKm`, `sort` (newest, price_asc, price_desc, nearest, ending_soon) |
| GET | /listings/:id | anyone | One listing; exact location only for the owner |
| POST | /listings | farmer | Fixed-price or auction listing |
| PATCH, DELETE | /listings/:id | owner | Edit or remove |
| POST | /listings/:id/pause, resume, sold, relist | owner | Change status |
| POST, DELETE | /listings/:id/photos | owner | Up to 6 photos, stored as WebP |
| GET | /me/listings | farmer | The farmer's own listings |
| PUT, DELETE | /listings/:id/save | signed in | Save or unsave a listing |
| GET | /me/saved | signed in | Saved listings |
| GET, POST, DELETE | /me/alerts | signed in | Crop alerts: a crop, optional municipality and highest price |
| GET | /me/notifications, /me/notifications/unread | signed in | In-app notices, such as a new listing matching an alert |
| POST | /me/notifications/read | signed in | Mark some (`ids`) or all notices read |
| POST | /listings/:id/offers | buyer | Offer a price, quantity and pickup date on a fixed-price listing (open 48 h) |
| GET | /listings/:id/offers, /me/offers?side=buying\|selling | signed in | Offer threads (the farmer sees all on their listing) |
| POST | /offers/:id/accept, reject, counter, withdraw | the side whose turn it is | Accepting creates an order and reduces the stock |
| GET | /listings/:id/auction | anyone | Live auction: highest bid, next minimum, masked bidders, countdown |
| POST | /listings/:id/bids | buyer | Bid; a bid in the last 5 minutes adds 5 minutes |
| POST | /listings/:id/auction/confirm, pass | farmer | Confirm the winner (creates the order) or pass to the next bidder |
| GET | /me/orders, /orders/:id | signed in | Agreed deals, with both phone numbers |
| PATCH | /orders/:id | either side | Set the pickup time (`pickupAt`) and place before pickup |
| POST | /orders/:id/ready | farmer | Ready for pickup, optionally with pickup details |
| POST | /orders/:id/picked-up | either side | The buyer has collected the produce |
| POST | /orders/:id/paid | buyer | "I have paid", with `method` CASH or BANK_TRANSFER |
| POST | /orders/:id/payment-received | farmer | Confirms the money arrived; the order completes once it is also picked up |
| POST | /orders/:id/cancel | either side | Cancel before pickup with a `reason`; fixed-price stock goes back on sale |
| POST | /orders/:id/review | either side | 1 to 5 stars and a comment, once per side, after completion |
| GET | /users/:id/reviews | anyone | Reviews someone has received |
| POST | /complaints | signed in | Report a user, listing or order (`targetType`, `targetId`, `reason`) |
| GET | /me/complaints | signed in | My reports and the admin's note |
| GET, PATCH | /admin/complaints | admin | Follow up: status OPEN, FOLLOWING_UP or CLOSED, and a note the filer sees |
| GET | /admin/stats, /admin/users?q= | admin | Counts, and user search by name or phone |
| POST | /admin/users/:id/suspend, unsuspend | admin | Suspending signs them out and pauses their listings on sale |
| POST | /admin/listings/:id/remove | admin | Take a listing down with a `reason` the farmer sees |
| POST, PATCH | /admin/crops | admin | Add or edit crops in the catalogue |
| GET | /health | anyone | Up check: API and database reachable |
| GET | /admin/audit | admin | Audit log of bids, accepted deals, order changes and admin actions (`entity`, `entityId`, `before`) |
| POST | /listings/:id/conversation | signed in | Start or reopen the chat with the farmer |
| GET | /me/conversations, /me/conversations/unread | signed in | Chats with last message and unread counts |
| GET, POST | /conversations/:id/messages, /conversations/:id/photos | either side | Read (marks read; `after` for polling) and send messages or photos |

Errors return a stable `code` (for example `OTP_INVALID`) that the web app translates.

## Pilot decisions

- Nawalpur village in Sarlahi is the pilot area; Nepali and English.
- Free during the pilot.
- Every deal goes through an order; a deal without one counts as cancelled.
- Each farmer posts under their own account.
- Parties settle disputes themselves; either can file a complaint and an admin follows up.
- Payments happen off the platform for the first release.
