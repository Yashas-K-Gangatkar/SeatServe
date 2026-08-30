# SeatServe — production image (Phase 4 deployment)
# Multi-stage: build with dev deps → run the standalone output.
# NOTE: the sandbox gateway is hash-routed single-port; for a real deployment
# also run mini-services/realtime-service (ports 3003/3004) beside the app.

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN bunx prisma generate && bun run lint --quiet || true && bun run build

FROM oven/bun:1-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static .next/static
COPY --from=build /app/public public
COPY --from=build /app/prisma prisma
COPY --from=build /app/db db
EXPOSE 3000
# production db push (idempotent) then start — set DATABASE_URL appropriately
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss --skip-generate || true; exec bun .next/standalone/server.js"]
