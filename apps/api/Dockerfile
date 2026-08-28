# ============================================================
# Stage 1: install dependencies
# ============================================================
FROM node:22-alpine AS installer

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace and lockfile manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: build
# ============================================================
FROM installer AS builder

COPY . .

RUN pnpm turbo build --filter=@breeyo/api...

# ============================================================
# Stage 3: production image
# ============================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy built API
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copy built packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist
COPY --from=builder /app/packages/validators/package.json ./packages/validators/
COPY --from=builder /app/packages/config/package.json ./packages/config/

# Copy workspace root files needed for pnpm install
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Generate the Prisma client against the production dependency tree --
# @prisma/client ships as a stub until `prisma generate` runs against it.
RUN pnpm --filter @breeyo/api exec prisma generate

# Run as the non-root `node` user (uid 1000, built into the official node
# image) rather than root -- a compromised process inside the container
# then has no write access outside what it's explicitly given below.
RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
