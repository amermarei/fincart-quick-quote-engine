FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/starter/package.json packages/starter/package.json
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000
COPY . .
RUN npm run build:web

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
COPY apps/web/server.mjs ./server.mjs
EXPOSE 5173
CMD ["node", "server.mjs"]