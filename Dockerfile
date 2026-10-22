# One build for both servers. Targets: `api` (NestJS) and `web` (Next.js).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
# `npm ci` runs `prisma generate`, which needs the schema.
COPY packages/db/prisma packages/db/prisma
RUN npm ci

FROM deps AS build
COPY . .
# The web app talks to the API through the same address (Caddy sends /api to it).
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SUPPORT_PHONE=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPPORT_PHONE=$NEXT_PUBLIC_SUPPORT_PHONE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @krisimandi/api && npm run build -w @krisimandi/web

FROM build AS api
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies any new database migrations, then starts the API.
CMD ["sh", "-c", "cd /app/packages/db && npx prisma migrate deploy && cd /app/apps/api && exec node dist/main.js"]

FROM build AS web
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
