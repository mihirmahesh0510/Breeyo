# Breeyo

Mobile-first veterinary clinic management for solo and small-team vets in India.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo (React Native) with Expo Router |
| Backend API | Fastify + Prisma ORM |
| Database | PostgreSQL with Row-Level Security |
| Cache/Queue | Redis (BullMQ) |
| Web dashboard | Next.js (Phase 9) |
| Design system | React Native Paper v5 (MD3) |
| Monorepo | Turborepo + pnpm workspaces |

## Repository Structure

```
breeyo/
  apps/
    api/              Fastify backend
      src/modules/
        auth/         JWT auth, OTP, RBAC, permissions
        clinic/       Clinic management
        notifications/ Push notifications, BullMQ workers
        patient/      Owner/pet registration, search, profiles
        queue/        Walk-in queue, status transitions, Socket.IO realtime
    mobile/           Expo React Native app
      src/features/
        patient/      Registration wizard, search, profiles
        queue/        Queue board, check-in, offline support
    web/              Next.js web dashboard (Phase 9)
  packages/
    ui/               Shared design system (tokens, components, wireframes)
    types/            Shared TypeScript type definitions
    validators/       Shared Zod validation schemas
    config/           Shared configs (tsconfig bases)
  infra/
    aws/              ECS task definitions (staging + production)
  scripts/
    backup/           Database backup verification scripts
  docs/
    disaster-recovery.md
    phase-01-test-results.md
  ERD/                Entity relationship documentation (phases 01-03)
  .github/
    workflows/        CI, deploy staging/production, visual regression, backup verify
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local PostgreSQL + Redis)

### Setup

```bash
# Install dependencies
pnpm install

# Start local database and Redis
docker compose up -d

# Run database migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# Seed test data
pnpm db:seed
```

### Development

```bash
# Start all apps in dev mode
pnpm dev

# Run all tests
pnpm test

# Run API tests only
pnpm --filter @breeyo/api test

# Run UI component tests only
pnpm --filter @breeyo/ui test
```

### Packages

**`@breeyo/ui`** -- Design system with 26 components following atomic design:

- 10 atoms (Typography, Button, TextInput, StatusBadge, Avatar, Chip, IconButton, Divider, ProgressIndicator, NotificationBadge)
- 8 molecules (SearchBar, ListItem, FormField, EmptyState, Toast, AccordionItem, SkeletonLoader, NotificationItem)
- 8 organisms (Card, Modal, BottomSheet, NavigationBar, BottomTabBar, QueueCard, WizardStepper, NotificationList)
- Wireframe stories for all modules with 4 states (empty, loading, populated, error)

**`@breeyo/validators`** -- Zod schemas shared between API and mobile for auth, clinic, patient, and queue validation.

**`@breeyo/types`** -- Shared TypeScript types for auth, patient, queue, notifications, and API contracts.

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 01 | Done | Foundation & Authentication |
| 02 | Done | UI/UX Design & Design System |
| 03 | Done | Patient Registration & Walk-in Queue |
| 04 | Next | EMR & Clinical Records |
| 05 | Planned | Inventory Management |
| 06 | Planned | Invoicing & Payments |
| 07 | Planned | WhatsApp Communication |
| 08 | Planned | Scheduling & Calendar |
| 09 | Planned | Web Dashboard & Owner Portal |
| 10 | Planned | Offline Hardening & Integration Polish |

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

See `.env.example` for the required variables.
