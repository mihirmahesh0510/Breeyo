# Breeyo Build Skill

## Description

Project-specific build conventions, phase workflow, and coding standards for the Breeyo veterinary clinic management platform.

## When to Use

Use this skill when working on any Breeyo feature development, bug fixes, or phase implementation. It encodes the project's architectural patterns and conventions.

## Project Structure

```
breeyo/
  apps/
    api/          @breeyo/api    - Fastify 5 + Prisma + PostgreSQL (RLS)
    mobile/       @breeyo/mobile - Expo SDK 52 + Expo Router
    web/          @breeyo/web    - Next.js (Phase 9)
  packages/
    ui/           @breeyo/ui     - Design system (26 components, atomic design)
    validators/   @breeyo/validators - Shared Zod schemas
    types/        @breeyo/types  - Shared TypeScript types
    config/       @breeyo/config - Shared tsconfig bases
```

## Phase Workflow

Breeyo is built in sequential phases. Each phase:

1. Has a dedicated branch: `breeyo/phase-NN-description`
2. Stacks on the previous phase branch
3. Uses commit prefix: `feat|fix|chore|docs(phase-NN): message`
4. Gets merged to `main` via PR after completion

### Current: Phase 03 - Patient Registration & Walk-in Queue

## API Conventions

### Module Structure
```
apps/api/src/modules/<name>/
  <name>.controller.ts   -- Request handlers
  <name>.service.ts      -- Business logic
  <name>.routes.ts       -- Route registration
  <name>.schema.ts       -- Zod request/response schemas
```

### Route Registration
```typescript
// In app.ts
await app.register(import('./modules/<name>/<name>.routes.js'), { prefix: '/api/v1' });
```

### Auth Middleware Stack
```typescript
// In route handler
{ preHandler: [app.authenticate, app.authorize('permission:code')] }
```

### Database Patterns
- RLS multi-tenancy: always set tenant context via `prisma-rls.ts`
- Two DB roles: `breeyo_admin` (migrations), `breeyo_app` (app queries)
- Prisma columns: `snake_case` with `@map()`, TypeScript: `camelCase`
- All IDs: UUID via `gen_random_uuid()`
- Table names: plural `snake_case` via `@@map()`

### Error Handling
- Throw Fastify errors with appropriate HTTP status codes
- Centralized error handler in `middleware/error-handler.ts`
- Audit log security-relevant events via `lib/audit-log.ts`

## UI Conventions

### Atomic Design Hierarchy
```
atoms/       -- Button, Typography, TextInput, StatusBadge, Avatar, etc.
molecules/   -- SearchBar, ListItem, FormField, EmptyState, Toast, etc.
organisms/   -- Card, Modal, BottomSheet, NavigationBar, QueueCard, etc.
wireframes/  -- Module-specific screen compositions with story states
```

### Design Tokens
- Primary: `#2E7D32` (green)
- Secondary: `#5D4037` (brown)
- Tertiary: `#E65100` (orange)
- Background: `#FFFBF5` (warm white)
- All tokens in `packages/ui/src/theme/`

### Wireframe Stories
Each wireframe must have 4 states:
1. **Empty** -- No data, show EmptyState component
2. **Loading** -- Skeleton loaders
3. **Populated** -- Normal state with data
4. **Error** -- Error message with retry

## Testing

- **Framework:** Vitest across all packages
- **API tests:** `supertest` with `buildApp({ logger: false })`
- **Test data:** `@faker-js/faker`
- **UI tests:** Accessibility checks included
- **CI:** GitHub Actions with real PostgreSQL 16 + Redis 7

## Key Files to Know

| File | Purpose |
|------|---------|
| `apps/api/src/app.ts` | App factory, plugin/route registration |
| `apps/api/src/server.ts` | Server entry point |
| `apps/api/prisma/schema.prisma` | Database schema |
| `apps/api/prisma/init-rls-roles.sql` | RLS role setup |
| `apps/api/prisma/post-migrate.sql` | Post-migration RLS policies |
| `packages/ui/src/theme/colors.ts` | Color tokens |
| `packages/ui/src/theme/theme.ts` | MD3 theme composition |
| `turbo.json` | Turborepo task config |
| `ERD/schema.md` | Entity relationship documentation |

## Build & Run

```bash
pnpm install                          # Install dependencies
docker compose up -d                  # Start PostgreSQL + Redis
pnpm db:generate                      # Generate Prisma client
pnpm db:migrate                       # Run migrations
pnpm db:seed                          # Seed test data
pnpm dev                              # Start all apps
pnpm test                             # Run all tests
pnpm --filter @breeyo/api test        # API tests only
pnpm --filter @breeyo/ui test         # UI tests only
```
