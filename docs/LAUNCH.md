# Launching the Nawalpur pilot

This guide takes KrisiMandi from the code to a live address that farmers and buyers in Nawalpur can use.
Everything runs on one small server with Docker: the database, the API, the web app, an HTTPS proxy and daily backups.

## 1. What you need to get

| What | Why | Notes |
| --- | --- | --- |
| A server (VPS) | Runs the app | Ubuntu 24.04, 2 GB RAM, 2 CPUs, 40 GB disk is enough for the pilot. Any provider works (for example DigitalOcean, Hetzner, or a Nepali host). |
| A domain name | The web address people open | Add a DNS **A record** pointing the domain (for example `krisimandi.com.np`) to the server's IP. |
| A Sparrow SMS account | Sends the sign-in codes | Sign up at sparrowsms.com, buy credit, ask them to approve a sender name, and copy the API token from the dashboard. |
| A support phone number | Shown in the app footer | A number farmers can call for help. |
| A Slack or Discord channel (optional) | Receives error alerts | Create an "incoming webhook" and copy its URL. |

## 2. Install on the server

```bash
# On the server, as a user with sudo:
curl -fsSL https://get.docker.com | sh
git clone https://github.com/DipakBarca/krisimandi.git
cd krisimandi
cp deploy/.env.example deploy/.env
nano deploy/.env        # fill in every value; use `openssl rand -hex 32` for the secrets
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

The first build takes a few minutes. When it finishes, load the place names, units and crops once:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env exec api npm run seed -w @krisimandi/db
```

Run the seed only once: running it again resets crop names an admin has edited.

Check it works:

- `https://YOUR-DOMAIN/api/health` shows `{"ok":true,...}`.
- `https://YOUR-DOMAIN` opens the app with a padlock (HTTPS is set up automatically).
- Signing in sends a real SMS code to your phone.

## 3. Make yourself admin

Sign in on the website once with your own number, then:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env exec api npm run make-admin -w @krisimandi/db -- 98XXXXXXXX
```

Reload the app: an **प्रशासन / Admin** link appears in the header. Use `--remove` at the end to take the role away.

## 4. Know when something breaks

- **Uptime:** create a free monitor at uptimerobot.com (or similar) for `https://YOUR-DOMAIN/api/health`, checking every 5 minutes, alerting your phone or email.
- **Errors:** with `ALERT_WEBHOOK_URL` set, server errors, failed SMS and failed background jobs post to your Slack or Discord channel (at most once every 5 minutes per problem).
- **Logs:** `docker compose -f deploy/compose.yml --env-file deploy/.env logs -f api`

## 5. Backups

The `backup` service saves the database and all uploaded photos and documents every day into `deploy/backups/` on the server, keeping 14 days (`BACKUP_KEEP_DAYS`). `deploy/backups/last-success` shows when the last one finished.

A backup on the same server does not survive the server being lost, so **copy the folder somewhere else every week**, for example to your laptop:

```bash
scp -r user@SERVER-IP:krisimandi/deploy/backups ./krisimandi-backups
```

To restore (this replaces the current data):

```bash
sh deploy/restore.sh db-2026-11-01_0300.dump uploads-2026-11-01_0300.tar.gz
```

Try a restore once before the pilot starts, so you know it works.

## 6. Updating the app

```bash
cd krisimandi
git pull
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Database changes are applied automatically when the API starts. The web app has to be rebuilt (the same command) after changing `NEXT_PUBLIC_SUPPORT_PHONE`.

## 7. Pilot checklist

**Before launch day**

- [ ] Server, domain and HTTPS working; health check green.
- [ ] Real SMS arrives on Ncell and NTC numbers.
- [ ] You are admin; a second trusted person is admin as a backup.
- [ ] Uptime monitor and error alerts set up; a test alert received.
- [ ] One restore from backup tested.
- [ ] Terms and privacy text read and approved (see below).
- [ ] A test deal done end to end with two phones: listing, offer, accept, ready, paid, picked up, review.

**Launch day in Nawalpur**

- [ ] Help each farmer sign up on their own phone and add the app to the home screen.
- [ ] Post one real listing together with photos.
- [ ] Explain: every deal goes through the deal record; pay each other directly; report problems in the app or call the support number.
- [ ] Collect citizenship or PAN photos for the verified badge, and approve them in Admin → Verification.

**Every week during the pilot**

- [ ] Admin → Overview: documents to check, open complaints, deals in progress.
- [ ] Follow up every complaint by phone and close it with a note.
- [ ] Copy the backups off the server.
- [ ] Check Sparrow SMS credit.

## Before going beyond the pilot

- The terms and privacy pages are plain-language drafts written for the pilot. Have someone who knows Nepali law (including the Privacy Act 2075) review them before opening KrisiMandi to the public.
- One server is fine for a village pilot. More users later will need a managed database and off-server photo storage.
