# Breeyo - Build Roadmap

## Milestone 1: MVP

### Phase 01 - Foundation & Authentication [DONE]

**Goal:** Monorepo scaffold, database, auth system, CI pipeline.

**Delivered:**
- Turborepo + pnpm workspace with `apps/api`, `apps/mobile`, `apps/web`, `packages/*`
- PostgreSQL with Prisma ORM and Row-Level Security multi-tenancy
- JWT auth with refresh token rotation and replay detection
- SMS OTP verification flow
- RBAC with 4 roles (owner, vet, technician, receptionist) and 20 permissions
- Permission override system per clinic member
- Post-signup onboarding wizard (3 steps with skip/completion tracking)
- BullMQ notification service with Expo push integration
- Tiered rate limiting (200/min global, 20/min auth)
- Sentry APM initialization
- ConsentRecord model for DPDP compliance
- Staff invite SMS notifications
- DR runbook and backup verification scripts
- GitHub Actions CI (build, test, deploy staging/production)
- 160 tests passing (103 API + 57 mobile)

### Phase 02 - UI/UX Design & Design System [DONE]

**Goal:** Component library, design tokens, wireframes for all modules.

**Delivered:**
- `@breeyo/ui` package with 26 components (atomic design)
  - 10 atoms: Typography, Button, TextInput, StatusBadge, Avatar, Chip, IconButton, Divider, ProgressIndicator, NotificationBadge
  - 8 molecules: SearchBar, ListItem, FormField, EmptyState, Toast, AccordionItem, SkeletonLoader, NotificationItem
  - 8 organisms: Card, Modal, BottomSheet, NavigationBar, BottomTabBar, QueueCard, WizardStepper, NotificationList
- Design tokens (colors, spacing, typography, elevation, borderRadius, animation)
- MD3 theme with veterinary palette (green primary, brown secondary, orange tertiary)
- i18n setup with i18next (English + Hindi ready)
- CSS token generator for web dashboard
- Wireframe stories for all modules with 4 states (empty, loading, populated, error)
- Storybook integration with visual regression workflow
- Component tests with accessibility checks

### Phase 03 - Patient Registration & Walk-in Queue [CURRENT]

**Goal:** Register patients (pets + owners), manage walk-in queue with real-time status.

**Requirements:**
- PAT-01: Pet registration (name, species, breed, DOB, weight, photo)
- PAT-02: Owner registration (name, phone, address, linked pets)
- PAT-03: Pet-owner linking (one owner many pets, transfer ownership)
- PAT-04: Patient search (by pet name, owner name, phone, microchip)
- PAT-05: Walk-in queue management (add to queue, status transitions, priority)
- PAT-06: CSV import for migrating existing patient records
- ONB-01: First-time onboarding flow for adding initial patients

### Phase 04 - EMR & Clinical Records [PLANNED]

**Goal:** Electronic medical records, consultation notes, prescriptions, templates.

### Phase 05 - Inventory Management [PLANNED]

**Goal:** Medicine and supply tracking, low-stock alerts, HSN/SAC codes, batch/expiry tracking.

### Phase 06 - Invoicing & Payments [PLANNED]

**Goal:** GST-compliant invoicing, payment recording, owner payment history.

### Phase 07 - WhatsApp Communication [PLANNED]

**Goal:** Automated reminders (vaccination, follow-up), appointment confirmations, owner messaging.

### Phase 08 - Scheduling & Calendar [PLANNED]

**Goal:** Appointment booking, calendar view, recurring appointments, availability management.

### Phase 09 - Web Dashboard & Owner Portal [PLANNED]

**Goal:** Next.js web dashboard for clinic analytics, owner-facing portal for pet records and appointments.

### Phase 10 - Offline Hardening & Integration Polish [PLANNED]

**Goal:** Offline-first data sync, conflict resolution, performance optimization, end-to-end integration testing.
