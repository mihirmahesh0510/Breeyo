# Stack Research

**Domain:** Veterinary Practice Management SaaS (India-focused)
**Researched:** 2026-04-10
**Confidence:** MEDIUM (domain knowledge; web research unavailable)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React Native (Expo) | SDK 52+ | Mobile app (iOS + Android) | Single codebase for both platforms; Expo simplifies OTA updates, push notifications, and camera/barcode access. Large ecosystem for India-market apps. Solo vets need Android-first — React Native handles mid-range Android 8+ well |
| Next.js | 15+ | Web dashboard (admin/analytics) | SSR for fast load on Indian networks; App Router for file-based routing; shared React component library with mobile. Vercel or self-hosted on AWS Mumbai |
| Node.js + Express/Fastify | 22 LTS | API server | JavaScript across full stack reduces context-switching; excellent async I/O for real-time queue updates; large talent pool in India |
| PostgreSQL | 16+ | Primary database | ACID compliance critical for medical records and billing; JSONB for flexible clinical data schemas; proven at scale for multi-tenant SaaS |
| Redis | 7+ | Caching + real-time | Walk-in queue real-time updates; session storage; appointment slot locking; pub/sub for multi-device sync |
| TypeScript | 5.5+ | Type safety across stack | Shared types between API, web, and mobile; catches errors early in medical/billing domain where correctness matters |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma | 6+ | ORM / database client | Type-safe queries for PostgreSQL; migration management; works well with TypeScript |
| React Query (TanStack) | 5+ | Server state management | API data fetching/caching for both web and mobile; offline support with persistence |
| Zustand | 5+ | Client state management | Lightweight, performant state for walk-in queue UI, form state; simpler than Redux for this scale |
| Socket.IO | 4+ | Real-time communication | Walk-in queue live updates; multi-device calendar sync; appointment status changes |
| react-native-camera / expo-camera | Latest | Barcode scanning | Inventory barcode scanning on mobile; offline-capable |
| i18next | 24+ | Internationalization | English + Hindi localization from launch; RTL-ready for future languages |
| date-fns | 4+ | Date/time handling | IST timezone handling; appointment scheduling; expiry date calculations |
| zod | 3+ | Schema validation | Shared validation between client and server; API input validation; form validation |
| Bull/BullMQ | 5+ | Job queues | WhatsApp message scheduling; reminder cron jobs; invoice generation; background processing |
| Razorpay SDK | Latest | Payment gateway | India-native; supports UPI, cards, wallets; webhook-based confirmation |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Expo EAS | Build & deploy mobile | Cloud builds for iOS/Android; OTA updates for bug fixes without app store review |
| Docker + Docker Compose | Local development | Consistent dev environment; PostgreSQL + Redis containers |
| Vitest | Unit/integration testing | Fast, TypeScript-native; compatible with React Testing Library |
| Detox or Maestro | Mobile E2E testing | Test critical flows: walk-in checkin, barcode scan, invoice generation |
| ESLint + Prettier | Code quality | Consistent formatting; catch common errors |
| GitHub Actions | CI/CD | Auto-test, build, deploy on push; mobile builds via EAS |

## Installation

```bash
# Monorepo setup (Turborepo)
npx create-turbo@latest breeyo

# Mobile (Expo)
npx create-expo-app apps/mobile --template blank-typescript

# Web (Next.js)
npx create-next-app apps/web --typescript --tailwind --app

# API (Node.js)
mkdir apps/api && cd apps/api
npm init -y
npm install fastify @fastify/cors @fastify/websocket prisma @prisma/client zod bullmq ioredis

# Shared packages
mkdir packages/types packages/validators packages/ui

# Dev dependencies
npm install -D typescript vitest @types/node eslint prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React Native (Expo) | Flutter | If team has Dart experience; slightly better Android perf on very low-end devices; less JS ecosystem integration |
| PostgreSQL | MongoDB | If clinical data schema is highly unpredictable; NOT recommended — medical records need ACID and relational integrity |
| Next.js | Remix | If streaming SSR is critical; Next.js has larger ecosystem and better Vercel deployment |
| Fastify | Express | If team prefers Express familiarity; Fastify is faster out of the box with schema validation |
| Prisma | Drizzle | If raw SQL performance is critical; Drizzle is lighter but less mature migration tooling |
| Turborepo | Nx | If project grows to 20+ packages; Nx has more features but steeper learning curve |
| Redis | Upstash | If serverless deployment; Upstash provides HTTP-based Redis for edge functions |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase/Firestore | Data residency concerns (no India region guarantee); vendor lock-in; poor for relational medical data | PostgreSQL on AWS Mumbai |
| GraphQL (for initial build) | Over-engineering for a Beta with 20 clinics; adds complexity without clear benefit at this scale | REST API with well-typed endpoints; add GraphQL in v2 if needed |
| Electron for desktop | Solo vets don't use desktops; web dashboard sufficient for admin | Next.js web app |
| Native iOS/Android | Two codebases doubles dev cost and time; vet market is Android-dominant in India | React Native with Expo |
| MySQL | PostgreSQL's JSONB is critical for flexible clinical data; better support for complex queries | PostgreSQL |
| Tailwind UI for mobile | React Native doesn't support Tailwind natively (NativeWind exists but adds complexity) | React Native Paper or Tamagui for mobile; Tailwind for web |
| Microservices | Over-engineering for Beta; monolith is faster to build and debug at 20-clinic scale | Modular monolith with clear bounded contexts |

## Stack Patterns by Variant

**If offline-first is critical (rural clinics):**
- Use WatermelonDB for local SQLite on mobile
- Sync via background jobs when connectivity returns
- Conflict resolution: last-write-wins for most fields; merge for appointment queues

**If WhatsApp API becomes available quickly:**
- Use official WhatsApp Business API via cloud provider (Gupshup, Twilio, or direct Meta)
- Webhook-based inbound message handling
- Template messages for reminders/invoices (pre-approved by Meta)

**If scaling beyond 1,000 clinics:**
- Move to multi-tenant PostgreSQL with row-level security (RLS)
- Add connection pooling (PgBouncer)
- Consider read replicas for analytics queries

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Expo SDK 52 | React Native 0.76+ | Use Expo's managed workflow for simplest setup |
| Prisma 6 | PostgreSQL 14-16 | Use PostgreSQL 16 for latest performance improvements |
| Next.js 15 | React 19 | Use React 19 for concurrent features |
| React Native 0.76+ | React 19 | New Architecture enabled by default |
| Socket.IO 4 | Node.js 18+ | Use with Redis adapter for horizontal scaling |
| BullMQ 5 | Redis 6.2+ | Requires Redis Streams support |

## Sources

- Domain knowledge: veterinary PMS architecture patterns
- India SaaS deployment patterns (AWS Mumbai region)
- React Native/Expo ecosystem experience
- Razorpay integration patterns for Indian payments
- Confidence: MEDIUM — no live web verification of latest versions performed

---
*Stack research for: Veterinary Practice Management SaaS (India)*
*Researched: 2026-04-10*
