# Production image for NewsLens KE (Next.js, output: 'standalone')

# ---- deps: install all packages ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No build args or secrets needed: every Supabase-backed page renders at request
# time, and NEXT_PUBLIC_SUPABASE_URL is only read on the server, so all env vars
# are supplied at runtime (docker run --env-file / platform env settings).
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Full node_modules first, so the pipeline scripts (rss-parser, article-extractor, etc.)
# can be loaded by /api/cron/pipeline even if Next's file tracing misses them.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000
CMD ["node", "server.js"]
