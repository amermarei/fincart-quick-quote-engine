# Debian-based node (glibc + libssl) — Prisma's schema/query engines do not
# work reliably on Alpine (musl) images: the CLI fails at runtime with
# "Could not parse schema engine response ... Error load ...".
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/starter/package.json packages/starter/package.json
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000
COPY . .
# The API consumes the built workspace packages (@qqe/shared, @qqe/starter)
# through their dist/ mains, so they MUST be built inside the container —
# dist/ is gitignored and not present in a fresh clone.
RUN npm run build:shared && npm run build:starter
# npm ci's postinstall runs prisma generate BEFORE the schema is in the
# image, so the client is generated explicitly here.
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build:api

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && npx tsx prisma/seed.ts && cd /app && node apps/api/dist/apps/api/src/main.js"]