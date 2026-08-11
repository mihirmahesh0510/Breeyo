---
phase: 07
slug: whatsapp-communication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x (`apps/api`, `apps/mobile`, `packages/ui`, `packages/validators`) |
| **Config file** | `apps/api/vitest.config.ts` (`environment: node`, `setupFiles: ['./tests/helpers/setup.ts']`, `fileParallelism: false`, 30s timeout); `apps/mobile/vitest.config.ts` (`environment: node`, no jsdom/RN preset — logic-level tests only) |
| **Quick run command** | `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30s quick / full turbo run varies |

Note: CLAUDE.md says API tests use `supertest`; actual Phase 3/4 tests use `buildTestApp()` + Fastify `app.inject()` pattern (`apps/api/tests/helpers/app.ts`). Follow the code, not the doc.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp`
- **After every plan wave:** Run `pnpm --filter @breeyo/api test` (includes `tests/whatsapp/**` integration suites; requires the Wave 0 migration)
- **Before `/gsd-verify-work`:** `pnpm test` fully green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 07-06a | 0 | — | Migrations exist for all 29 schema models | integration | `pnpm --filter @breeyo/api exec prisma migrate status` | ❌ W0 | ⬜ pending |
| TBD | 07-01/02 | 0-1 | WHA-04 | `SimulatorProvider.capabilities` matches Cloud API limits (3 buttons/20 chars/10 rows/24 chars) | unit | `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp/providers/__tests__/simulator.provider.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-04 | `sendFreeform` throws `OUTSIDE_SERVICE_WINDOW` when window closed | unit | same file | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-04 | `provider-registry` returns `CloudApiProvider` when `WHATSAPP_PROVIDER=cloud-api` | unit | `... provider-registry.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-10 | 1-2 | WHA-04 | Cloud API mapper produces valid Meta template payload; normalizes 131026/131047/132000 error codes | unit | `... cloud-api.mapper.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-10 | 1-2 | WHA-04 | `verifyMetaSignature` accepts correct HMAC, rejects tampered body | unit | `... cloud-api.webhook.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-05 | Send persists `WhatsAppMessage(status=QUEUED)` before any dispatch | integration | `tests/whatsapp/send.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-10 | 1-2 | WHA-05 | Status ladder is monotonic (DELIVERED then SENT leaves DELIVERED) | unit | `... delivery-status.service.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-10 | 1-2 | WHA-05 | Every status change appends a `WhatsAppMessageStatusEvent` row | integration | `tests/whatsapp/status-ledger.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-10 | 1-2 | WHA-05 | Duplicate webhook for the same `providerMessageId` is a no-op | integration | `tests/whatsapp/webhook-idempotency.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-07 | 2 | WHA-05 | Inbox list returns threads filtered by All/Invoices/Reminders/Bookings/Failed/Needs action | integration | `tests/whatsapp/inbox.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-09 | 2 | WHA-01 (D-01) | Sweep creates ADVANCE task at follow-up −1 day and ON_DATE task on the day | unit | `... reminder-sweep.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-09 | 2 | WHA-01 (D-02) | Sweep creates vaccine/deworming tasks at due −3 days and on due date; superseded records produce no task | unit | same file | ❌ W0 | ⬜ pending |
| TBD | 07-09 | 2 | WHA-01 (D-03) | Sweep run twice same day creates exactly one task per source/kind/touch; no-reply escalates exactly 3 days later | integration/unit | `tests/whatsapp/reminder-idempotency.test.ts` / `... reminder-task.service.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-09 | 2 | WHA-01 (D-04) | After 2 attempts with no reply → `CAPPED_NEEDS_ACTION`, `thread.needsAction=true`, no third send | unit | same file | ❌ W0 | ⬜ pending |
| TBD | 07-09 | 2 | WHA-01 (D-05) | `WaReminderKind` has no payment value; sweep never creates a payment-reminder task | unit | same file | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-01 | Inbound reply transitions matching task to `REPLIED`, cancels escalation | unit | `... inbound-router.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-05 | 3 | WHA-02 | `invoice_delivery` sends via `contextType=INVOICE`/`contextId`, link-only (D-18), no FK to nonexistent `Invoice` | integration | `tests/whatsapp/invoice-delivery.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-02 (D-10) | `invoice_delivery`/`booking_confirmation` send even when `remindersOptedOut=true` | integration | `tests/whatsapp/opt-out.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-02/03 (D-10/11) | Reminder-category templates blocked when `remindersOptedOut=true`, for all owner's pets | integration | same file | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-02 (D-13) | Send proceeds with missing consent, writes an audit entry | integration | `tests/whatsapp/consent.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-02 (D-12) | Consent grant appends `ConsentRecord(consentType='whatsapp_communication')`; withdrawal stamps `withdrawnAt` | integration | same file | ❌ W0 | ⬜ pending |
| TBD | 07-03 | 2 | WHA-03 (D-06) | Inbound slot pick auto-confirms without staff action, queues `booking_confirmation` | integration | `tests/whatsapp/booking.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-03 | 2 | WHA-03 (D-07) | Two concurrent confirmations for same slot → one `CONFIRMED`, one `SLOT_TAKEN` | integration | `tests/whatsapp/booking-concurrency.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-03 | 2 | WHA-03 (D-08) | Confirmed slot absent from next slot-offer list for that clinic/day | integration | `tests/whatsapp/booking.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-03 | 2 | WHA-03 (D-09) | No inbound payload can cancel/move a booking; only authenticated staff endpoints can | integration | `tests/whatsapp/booking-authz.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-03 | 2 | WHA-03 | Slot offer never exceeds 10 rows, every label ≤24 chars; `workingHours=null` → no slots, call-the-clinic guidance | unit | `... slot.service.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-04 (D-14) | Auto-reply job enqueued with configured delay and dedupe `jobId` | unit | `... simulator.provider.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-04 (D-15) | Auto-reply for booking action card always picks positive/confirm path | unit | `... simulator-reply.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-02 | 1 | WHA-04 (D-16) | `deliveryMode` FAIL/INVALID_NUMBER/DELAYED produce expected outcomes; global per-clinic, not per-thread | unit | `... simulator.provider.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-01 | 0 | WHA-05 | Template variable Zod validation rejects missing variable with 400 before persistence | unit | `packages/validators` — `... whatsapp.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-07 | 2 | WHA-05 | `requirePermission('SEND_WHATSAPP')` returns 403 for a role lacking it | integration | `tests/whatsapp/authz.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 07-07 | 2 | WHA-05 | Threads from clinic A never visible to clinic B | integration | extend `apps/api/tests/tenant-isolation.test.ts` | ⚠️ file exists, needs WhatsApp cases | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/prisma/migrations/<ts>_add_phase_3_to_6_models/` — generate the missing migrations so `pets`, `consultations`, `vaccination_records`, `deworming_records`, `queue_entries`, etc. exist. Blocks every WhatsApp integration test (Pitfall 4). Confirmed in-scope per CONTEXT.md D-19.
- [ ] `apps/api/prisma/migrations/<ts>_add_whatsapp_communication/` — the Phase 7 tables
- [ ] `apps/api/tests/helpers/factories.ts` — add `createTestPetOwner`, `createTestPet`, `createTestConsultation`, `createTestVaccinationRecord`, `createTestWhatsAppThread`; extend `cleanupTestData` to truncate new tables
- [ ] `apps/api/tests/whatsapp/` — new directory with the integration suites listed above
- [ ] `apps/api/src/modules/whatsapp/**/__tests__/` — unit suites colocated per Phase 4 convention
- [ ] `packages/validators/src/__tests__/whatsapp.test.ts` — template variable schema tests
- [ ] `apps/api/src/lib/ist-date.ts` + test — extract `getTodayIST`/`addDaysIST` from `QueueRepository`
- [ ] Worker test guard — `Worker` construction skippable in tests (Pitfall 7); export directly-callable job handlers
- [ ] **Decision task (resolved, CONTEXT.md D-17):** spike `@breeyo/ui` + `react-native-paper` + `react-native-reanimated` + `react-native-gesture-handler` in `apps/mobile/package.json`; fall back to plain RN + UI-SPEC token values if the spike proves fiddly
- [ ] Root `.env.example` — add the seven `WHATSAPP_*` variables
- [ ] `packages/types/src/constants/socket-events.ts` — add `WHATSAPP_MESSAGE_CREATED`, `WHATSAPP_MESSAGE_STATUS_CHANGED`, `WHATSAPP_THREAD_UPDATED`
- [ ] `apps/api/src/lib/audit-log.ts` — extend `AuditEvent` with WhatsApp consent/opt-out/invalid-number events (Pitfall 6)

Framework install: none needed — Vitest 2.1.x already present in every affected package.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Mobile inbox/thread/config visual states (loading/empty/populated/error) | WHA-05, UI-SPEC | Mobile Vitest has no jsdom/RN rendering preset (`environment: node`) — component rendering isn't supported in this repo's test infra | Manually walk each of the 4 screens through 4 states per 07-UI-SPEC.md Screen States Contract |
| 44pt touch targets, WCAG AA contrast, font scaling to 1.5x | UI-SPEC Accessibility Contract | No automated accessibility testing infra in this repo | Manual inspection with device accessibility inspector / font scale settings |
| Android hardware back button behavior (thread→inbox, bottom sheet dismiss) | UI-SPEC Interaction Contract | Requires a running device/emulator, not unit-testable | Manual walkthrough on Android emulator |
| Screen-reader labels on message bubbles, quick replies, action cards | UI-SPEC Accessibility Contract | Requires a running device with screen reader enabled | Manual walkthrough with TalkBack/VoiceOver |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
