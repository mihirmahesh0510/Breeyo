# Phase 3: Patient Registration & Walk-in Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 03-patient-registration-walk-in-queue
**Areas discussed:** Registration flow, Check-in experience, Queue board behavior, Patient search & profiles, Real-time sync behavior, Multi-user queue workflow, Queue capacity & edge cases, Data entry accessibility

---

## Registration Flow

### New Pet Registration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Two-step wizard | Step 1: Owner info. Step 2: Pet info. Clean separation, matches Phase 2 wizard pattern | :heavy_check_mark: |
| Single scrollable form | Owner + first pet on one screen with section dividers | |
| Owner first, pet later | Register owner only at reception, pet added when consultation starts | |

**User's choice:** Two-step wizard (Recommended)

### Species & Breed Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Searchable dropdown | Pre-loaded list of common species and breeds, type to filter, custom entry for exotic pets | :heavy_check_mark: |
| Quick-tap grid | Icon grid showing top 6-8 species, tap species shows breed dropdown | |
| Free text only | User types species and breed manually | |

**User's choice:** Searchable dropdown (Recommended)

### Required vs Optional Fields

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal required | Pet name + species required, everything else optional | :heavy_check_mark: |
| Moderate required | Pet name + species + breed + approximate age required | |
| You decide | Claude picks the right balance | |

**User's choice:** Minimal required (Recommended)

### Returning Owner Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect by mobile | Enter mobile, system finds existing owner + pets, select pet | :heavy_check_mark: |
| Search then link | Search by name or mobile, pick owner from results | |
| Always start fresh | Registration form always appears, pre-fill if mobile matches | |

**User's choice:** Auto-detect by mobile (Recommended)

### Multi-pet Registration

| Option | Description | Selected |
|--------|-------------|----------|
| "Add another pet" button | After completing pet step, show button to loop back | :heavy_check_mark: |
| Add pets from owner profile | Register first pet only, add more from profile later | |
| Pet list on step 2 | Step 2 shows list with "Add" button for multiple pets at once | |

**User's choice:** "Add another pet" button (Recommended)

### Owner Info Collected

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile + name only | Required: mobile + name. Optional: address, email, alternate phone | :heavy_check_mark: |
| Mobile + name + address | Required: mobile, name, address | |
| You decide | Claude picks based on downstream needs | |

**User's choice:** Mobile + name only (Recommended)

### Duplicate Owner Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile number is unique key | One owner per mobile, prevents duplicates at source | :heavy_check_mark: |
| Warn but allow | Show warning with existing owner, user can merge or create new | |
| You decide | Claude picks the right strategy | |

**User's choice:** Mobile number is unique key (Recommended)

### Pet Photos

| Option | Description | Selected |
|--------|-------------|----------|
| Optional photo | Camera/gallery option but not required | :heavy_check_mark: |
| No photos for Beta | Skip photos entirely | |
| Photo required | Require a photo for every pet | |

**User's choice:** Optional photo (Recommended)

### Species Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All species | Dogs, cats, birds, cows, buffaloes, goats, horses, etc. | |
| Companion animals only | Dogs, cats, birds, rabbits, fish, reptiles | :heavy_check_mark: |
| Configurable per clinic | Clinic sets which species they treat during setup | |

**User's choice:** Companion animals only
**Notes:** User chose companion animals over all species -- focus on urban/metro clinics

### Pet Age Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Approximate age input | "Years" and "Months" number fields | :heavy_check_mark: |
| Date of birth picker | Calendar date picker for DOB | |
| Both options | Offer DOB picker AND approximate age | |

**User's choice:** Approximate age input (Recommended)

### Registration Notes

| Option | Description | Selected |
|--------|-------------|----------|
| Optional notes field | Free text for allergies, behavioral warnings, special handling | :heavy_check_mark: |
| No notes at registration | Keep registration minimal, notes in EMR | |
| Structured tags | Predefined tags like "Aggressive", "Allergic" | |

**User's choice:** Optional notes field (Recommended)

### Quick vs Full Registration from Check-in

| Option | Description | Selected |
|--------|-------------|----------|
| Quick inline registration | Minimal fields: owner mobile + name, pet name + species | :heavy_check_mark: |
| Full wizard always | Always open two-step wizard even from check-in | |
| You decide | Claude picks based on 2-tap requirement | |

**User's choice:** Quick inline registration (Recommended)

---

## Check-in Experience

### 2-tap Check-in Flow

| Option | Description | Selected |
|--------|-------------|----------|
| FAB -> mobile search -> tap pet | FAB opens sheet with mobile input, auto-shows owner + pets, tap pet | :heavy_check_mark: |
| FAB -> recent patients list | FAB shows recent/frequent patients at top, search below | |
| Search bar on queue screen | Always-visible search bar, no FAB needed | |

**User's choice:** FAB -> mobile search -> tap pet (Recommended)

### Visit Reason Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Optional quick-select | Bottom sheet with common reasons after check-in, skippable | :heavy_check_mark: |
| No reason at check-in | Check-in is just "patient is here" | |
| Required reason | Must select reason before completing check-in | |

**User's choice:** Optional quick-select (Recommended)

### Urgency/Priority Flag

| Option | Description | Selected |
|--------|-------------|----------|
| Optional priority toggle | "Emergency" toggle, red badge, jumps to top of queue | :heavy_check_mark: |
| No priority system | Strictly first-come-first-served | |
| Multi-level priority | Emergency, Urgent, Normal | |

**User's choice:** Optional priority toggle (Recommended)

### Post-Check-in Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + return to queue | Brief toast with position, return to queue view | :heavy_check_mark: |
| Confirmation card | Show card with details, dismiss to return | |
| You decide | Claude picks feedback pattern | |

**User's choice:** Toast + return to queue (Recommended)

---

## Queue Board Behavior

### Calling Next Patient

| Option | Description | Selected |
|--------|-------------|----------|
| "Call Next" button | Prominent button at top, calls next Waiting, also tap any card to call | :heavy_check_mark: |
| Swipe to call | Swipe right on card to call in | |
| Tap card -> action menu | Tap card opens action sheet with options | |

**User's choice:** "Call Next" button (Recommended)

### Status Transitions

| Option | Description | Selected |
|--------|-------------|----------|
| Tap status badge to cycle | Waiting -> In Consult -> Done. Long-press for No-show | :heavy_check_mark: |
| Action sheet per card | Tap card opens bottom sheet with all status options | |
| Auto-transition | Status auto-changes based on context | |

**User's choice:** Tap status badge to cycle (Recommended)

### Wait Time Estimation

| Option | Description | Selected |
|--------|-------------|----------|
| Simple average calculation | Position x average consultation time from last 7 days | :heavy_check_mark: |
| No estimation for Beta | Show queue position only | |
| Configurable per clinic | Clinic sets average consultation duration in settings | |

**User's choice:** Simple average calculation (Recommended)

### Queue Filtering/Grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by status | Three sections: In Consult (top), Waiting (middle), Done (bottom, collapsed) | :heavy_check_mark: |
| Waiting only by default | Show only Waiting, toggle tabs for others | |
| All in one flat list | Single list with status badges | |

**User's choice:** Grouped by status (Recommended)

### Queue Card Info

| Option | Description | Selected |
|--------|-------------|----------|
| Essential info | Pet name, species icon, owner name, check-in time, position, badge, reason, emergency flag | :heavy_check_mark: |
| Minimal info | Pet name + owner name + status badge only | |
| Rich info | Pet name, species, breed, owner name + phone, all timestamps, reason, last visit | |

**User's choice:** Essential info (Recommended)

### No-show Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Manual no-show marking | Long-press badge -> "Mark No-show", moves to Done section | :heavy_check_mark: |
| Auto no-show after timeout | Auto-mark if not called within X minutes | |
| You decide | Claude picks the approach | |

**User's choice:** Manual no-show marking (Recommended)

### End of Day Reset

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-archive at midnight | Queue resets at midnight, Done/No-show archived to history | :heavy_check_mark: |
| Manual clear | Vet manually clears queue at end of day | |
| Rolling 24-hour | No day boundary, entries stay until cleared | |

**User's choice:** Auto-archive at midnight (Recommended)

### Queue Event Alerts

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle notification | Gentle sound + vibration on queue events, configurable per-user | :heavy_check_mark: |
| Visual only | No sound or haptics, visual updates only | |
| You decide | Claude picks notification behavior | |

**User's choice:** Subtle notification (Recommended)

---

## Patient Search & Profiles

### Search UX

| Option | Description | Selected |
|--------|-------------|----------|
| Live search bar | Results update as you type, searches name/mobile/pet simultaneously | :heavy_check_mark: |
| Search with filters | Search bar + filter chips by species, date, status | |
| You decide | Claude picks search UX | |

**User's choice:** Live search bar (Recommended)

### Default View

| Option | Description | Selected |
|--------|-------------|----------|
| Recent patients list | Sorted by most recent visit, pet name/species/owner/last visit | :heavy_check_mark: |
| All owners alphabetical | Owner list A-Z with pets nested | |
| Today's patients | Only patients who visited today | |

**User's choice:** Recent patients list (Recommended)

### Pet Profile Page

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + visit history | Top: photo/details, Middle: quick stats, Bottom: visit timeline | :heavy_check_mark: |
| All info on one page | Everything on one scrollable page | |
| Tabbed profile | Profile split into tabs: Overview, History, Notes | |

**User's choice:** Summary + visit history (Recommended)

### Owner-to-Pet Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Owner card with pet list | Tap owner shows details + pet cards below | :heavy_check_mark: |
| Flat pet list with owner info | Pets listed individually with owner name on each | |
| You decide | Claude picks navigation pattern | |

**User's choice:** Owner card with pet list (Recommended)

### Cross-clinic Visit History

| Option | Description | Selected |
|--------|-------------|----------|
| Current clinic only | Visit history shows current clinic only for Beta | :heavy_check_mark: |
| All clinics with labels | Show visits from all clinics with clinic name labels | |
| You decide | Claude picks based on Phase 1 data sharing model | |

**User's choice:** Current clinic only (Recommended)

### Pet Profile Editing

| Option | Description | Selected |
|--------|-------------|----------|
| Edit button -> edit mode | Tap "Edit" to enable editing, Save/Cancel buttons | :heavy_check_mark: |
| Always editable fields | Fields always editable inline, auto-saves | |
| You decide | Claude picks editing pattern | |

**User's choice:** Edit button -> edit mode (Recommended)

### Visit History Timeline

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological cards | Newest at top, each visit as card, tap to expand | :heavy_check_mark: |
| Calendar-based view | Monthly calendar with dots on visit dates | |
| Grouped by year/month | Visits under month headers, collapsible | |

**User's choice:** Chronological cards (Recommended)

### Duplicate Pet Merging

| Option | Description | Selected |
|--------|-------------|----------|
| Not for Beta | Handle manually via database/support if needed | :heavy_check_mark: |
| Simple merge tool | Admin selects two records and merges | |
| You decide | Claude assesses need | |

**User's choice:** Not for Beta (Recommended)

---

## Real-time Sync Behavior

### Sync Method

| Option | Description | Selected |
|--------|-------------|----------|
| Instant push via WebSocket | Socket.IO push, 1-2 second updates on all devices | :heavy_check_mark: |
| Push + pull-to-refresh fallback | WebSocket primary, pull-to-refresh if disconnected | |
| Polling every 5 seconds | No WebSocket, poll server every 5 seconds | |

**User's choice:** Instant push via WebSocket (Recommended)

### Offline Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Show stale with banner | Last-known state + yellow "Offline" banner, auto-sync on reconnect | :heavy_check_mark: |
| Queue offline actions | Allow check-ins/changes offline, sync on reconnect | |
| You decide | Claude picks for Phase 3 vs Phase 10 | |

**User's choice:** Show stale with banner (Recommended)

### Concurrent Edits

| Option | Description | Selected |
|--------|-------------|----------|
| Last write wins | Most recent timestamp wins, toast notifies other user | :heavy_check_mark: |
| Optimistic lock | Version number check, reject on mismatch | |
| You decide | Claude picks conflict resolution | |

**User's choice:** Last write wins (Recommended)

---

## Multi-user Queue Workflow

### Role-based Views

| Option | Description | Selected |
|--------|-------------|----------|
| Same view, same actions | Everyone sees same queue, all roles can do all actions | :heavy_check_mark: |
| Same view, different actions | Same display but role-restricted actions | |
| Different views per role | Front desk and vet see different views | |

**User's choice:** Same view, same actions (Recommended)

### Vet Attribution

| Option | Description | Selected |
|--------|-------------|----------|
| Show vet name on card | In Consult cards show "with Dr. Priya" | :heavy_check_mark: |
| No vet attribution | Status only, who's treating is implied | |
| You decide | Claude decides for multi-vet vs solo | |

**User's choice:** Show vet name on card (Recommended)

---

## Queue Capacity & Edge Cases

### Queue Size Limit

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited | No artificial limit, scrollable list handles any size | :heavy_check_mark: |
| Configurable max | Clinic sets max patients per day | |
| You decide | Claude picks based on volumes | |

**User's choice:** Unlimited (Recommended)

### End of Day In Consult Patients

| Option | Description | Selected |
|--------|-------------|----------|
| Stay until manually completed | In Consult persists past midnight, only Waiting/Done archive | :heavy_check_mark: |
| Archive everything | All entries archive at midnight | |
| You decide | Claude picks safest handling | |

**User's choice:** Stay until manually completed (Recommended)

### Same-day Re-check-in

| Option | Description | Selected |
|--------|-------------|----------|
| Allow with confirmation | Show "already seen today" warning, allow re-check-in | :heavy_check_mark: |
| Block re-check-in | Once checked in today, can't check in again | |
| You decide | Claude picks handling | |

**User's choice:** Allow with confirmation (Recommended)

---

## Data Entry & Accessibility

### Hindi/Devanagari Support

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, Unicode support | All name fields accept Devanagari and Latin, search works across both | :heavy_check_mark: |
| Latin only for Beta | Restrict to English/Latin characters | |
| You decide | Claude picks for demographics | |

**User's choice:** Yes, Unicode support (Recommended)

### Mobile Number Formatting

| Option | Description | Selected |
|--------|-------------|----------|
| 10-digit with auto-format | Auto-formats as typed, validates starts with 6-9, numeric keyboard | :heavy_check_mark: |
| Free text | Accept any format, normalize on save | |
| With country code | +91 prefix auto-added | |

**User's choice:** 10-digit with auto-format (Recommended)

### Smart Form Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual suggestions | Breed suggestions after species, age defaults, placeholder hints, recent mobiles | :heavy_check_mark: |
| No suggestions | All fields start blank | |
| You decide | Claude picks form intelligence level | |

**User's choice:** Contextual suggestions (Recommended)

---

## Claude's Discretion

- Exact WebSocket reconnection strategy and retry logic
- Queue card animation details (status transitions, new entry appearance)
- Search debounce timing
- Exact species and breed lists for the searchable dropdown
- Wait time display format and update frequency
- Toast notification duration and positioning
- Queue position numbering reset behavior
- Pull-to-refresh behavior as WebSocket fallback

## Deferred Ideas

None -- discussion stayed within phase scope.
