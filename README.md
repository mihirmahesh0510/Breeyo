# Breeyo

Mobile-first veterinary clinic management for solo and small-team vets in India.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo (React Native) with Expo Router |
| Backend API | Fastify + Prisma ORM |
| Database | PostgreSQL with Row-Level Security |
| Cache/Queue | Redis (BullMQ) |
| Web dashboard | Next.js |
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
        scheduling/   Appointments, availability, booking, reminders (and more)
    mobile/           Expo React Native app
      src/features/
        patient/      Registration wizard, search, profiles
        queue/        Queue board, check-in, offline support
        scheduling/   Day agenda, booking sheet, availability settings (and more)
    web/              Next.js web dashboard: staff login, week-view schedule
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

### Checking the app in the Android Emulator

One-time setup is already done on this machine: Java (`openjdk@21`) and the Android SDK command-line tools were installed via Homebrew (`/usr/local/share/android-commandlinetools`), and a `Breeyo_Pixel_7` AVD (Android 14 / API 34) was created. `JAVA_HOME`/`ANDROID_HOME`/`PATH` are exported in `~/.zshrc`.

To check the app after any phase, run:

```bash
pnpm preview:mobile
```

This boots the `Breeyo_Pixel_7` emulator if it isn't already running, starts Postgres/Redis (Docker) and the API dev server, then opens the app in the emulator via Expo Go. Press Ctrl+C to stop the API (the emulator keeps running so the next `preview:mobile` skips the boot).

On a machine without this setup already done, set it up once with:

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
yes | sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-34" "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n Breeyo_Pixel_7 -k "system-images;android-34;google_apis;x86_64" --device "pixel_7"
```

### Packages

**`@breeyo/ui`** -- Design system with 26 components following atomic design:

- 10 atoms (Typography, Button, TextInput, StatusBadge, Avatar, Chip, IconButton, Divider, ProgressIndicator, NotificationBadge)
- 8 molecules (SearchBar, ListItem, FormField, EmptyState, Toast, AccordionItem, SkeletonLoader, NotificationItem)
- 8 organisms (Card, Modal, BottomSheet, NavigationBar, BottomTabBar, QueueCard, WizardStepper, NotificationList)
- Wireframe stories for all modules with 4 states (empty, loading, populated, error)

**`@breeyo/validators`** -- Zod schemas shared between API and mobile for auth, clinic, patient, and queue validation.

**`@breeyo/types`** -- Shared TypeScript types for auth, patient, queue, notifications, scheduling, and API contracts.

## Build Phases

See [`.planning/ROADMAP.md`](.planning/ROADMAP.md) for the full phase list and current status.

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

See `.env.example` for the required variables.
