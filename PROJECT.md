# Breeyo - Project Definition

## Vision

Mobile-first veterinary clinic management for solo and small-team veterinarians in India. Breeyo replaces paper registers, WhatsApp-based reminders, and spreadsheet billing with a single integrated platform that works offline and on low-bandwidth connections.

## Target Users

- **Primary:** Solo veterinarians and small clinics (1-5 staff) in Indian cities and semi-urban areas
- **Secondary:** Pet owners who interact via WhatsApp reminders and an owner portal

## Core Problems

1. Patient records are paper-based, hard to search, and easy to lose
2. Walk-in queues are managed manually with no visibility for staff or owners
3. Vaccination and follow-up reminders rely on manual WhatsApp messages
4. Inventory tracking is ad-hoc; clinics don't know when supplies run low
5. Invoicing is done on paper or generic billing software with no clinical integration
6. No scheduling system — everything is walk-in with no appointment option

## Key Constraints

- **Offline-first:** Must work without internet in rural/semi-urban clinics
- **Low-bandwidth:** Optimized for slow 4G connections
- **India-specific:** GST invoicing, GSTIN, HSN/SAC codes, INR currency, Hindi/English i18n
- **DPDP compliance:** Data Protection and Digital Privacy Act consent tracking
- **Small team:** No dedicated IT staff; setup must be self-service
- **Cost-sensitive:** Infrastructure costs must stay low (AWS ap-south-1)

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile framework | Expo (React Native) | Single codebase, OTA updates, push notifications |
| Backend | Fastify | Low overhead, good TypeScript support, plugin ecosystem |
| Database | PostgreSQL + RLS | Multi-tenancy without separate DBs per clinic |
| ORM | Prisma | Type-safe queries, migration management |
| Auth | JWT + refresh rotation | Stateless auth with replay detection |
| Queue | BullMQ + Redis | Background jobs for notifications, reports |
| Design system | React Native Paper v5 | Material Design 3, accessible, well-maintained |
| Monorepo | Turborepo + pnpm | Shared packages, parallel builds |
| Hosting | AWS ECS | ap-south-1 region, cost-effective for India |

## Success Metrics

- Clinic can register patients and manage walk-in queue within 30 seconds
- App loads and is usable within 3 seconds on 4G
- Works offline for core workflows (patient lookup, queue management)
- Owner receives WhatsApp reminder within configured time window
- Zero data loss during offline-to-online sync
