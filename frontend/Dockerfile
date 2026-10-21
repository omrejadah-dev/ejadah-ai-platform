# Web (Next.js standalone). Build context: frontend/
#   docker build -t ejadah-web --build-arg NEXT_PUBLIC_TILE_URL=... frontend
FROM node:24-alpine AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1 PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui-kit/package.json packages/ui-kit/
RUN npm ci --no-audit --no-fund
COPY apps apps
COPY packages packages
# baked into the client bundle at build time
ARG NEXT_PUBLIC_TILE_URL=""
ARG NEXT_PUBLIC_TILE_ATTRIBUTION=""
ARG NEXT_PUBLIC_FF_ESTIMATE=""
# only used if /api is not routed by nginx (it is in docker-compose.prod.yml)
ARG API_UPSTREAM_URL=http://api:8080
ENV NEXT_PUBLIC_TILE_URL=$NEXT_PUBLIC_TILE_URL NEXT_PUBLIC_TILE_ATTRIBUTION=$NEXT_PUBLIC_TILE_ATTRIBUTION \
    NEXT_PUBLIC_FF_ESTIMATE=$NEXT_PUBLIC_FF_ESTIMATE API_UPSTREAM_URL=$API_UPSTREAM_URL
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S web && adduser -S web -G web
# standalone output keeps the monorepo layout: server at apps/web/server.js
COPY --from=build --chown=web:web /src/apps/web/.next/standalone ./
COPY --from=build --chown=web:web /src/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=web:web /src/apps/web/public ./apps/web/public
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
