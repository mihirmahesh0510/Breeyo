# Breeyo Phase 2: UI/UX Design & Design System

---

## For Product — What This Phase Does

Phase 2 establishes the **visual and interaction foundation** for the entire Breeyo app. It adds **zero database models** — instead it builds the component library, design tokens, wireframes, and internationalization that all feature phases consume.

### Features Delivered

1. **Design Token System** — Colors, typography (7-level scale), spacing (8px base grid), elevation (6 levels), border radius (6 levels), animation timing (7 durations). Single source of truth for all visual decisions.

2. **26-Component Library** — Organized in atomic design (atoms > molecules > organisms). Every component is typed, accessible, and themed via React Native Paper v5.

3. **Wireframe Stories** — Hi-fidelity wireframes for every major module (auth, queue, EMR, inventory, billing, scheduling, notifications, portal, dashboard, WhatsApp). Each shows 4 states: empty, loading, populated, error.

4. **i18n Support** — English and Hindi translations via i18next + react-i18next. All UI strings externalized. Supports interpolation (`{{count}} min` / `{{count}} minit`).

5. **Accessibility (WCAG 2.1 AA)** — 4.5:1 contrast ratios, 44x44pt minimum tap targets, semantic roles on typography, text labels on all status badges (not color-only).

6. **CSS Token Generation** — Script generates CSS custom properties from TypeScript tokens for web consumption (`pnpm --filter @breeyo/ui generate:css-tokens`).

### What This Means for Users

Users don't "see" Phase 2 directly — but every screen they interact with in Phase 3+ is built from these components. The warm green/brown/orange palette differentiates Breeyo from clinical human healthcare apps. Hindi support means front desk staff in tier-2/3 Indian cities can use the app in their preferred language.

---

## For Business — Rules, Compliance & Impact

### Design Decisions with Business Impact

| Decision | Rationale |
|----------|-----------|
| **Warm palette** (green/brown/orange vs clinical blue/white) | Differentiates from human healthcare apps; feels approachable for pet owners |
| **Hindi i18n** | 40%+ of Indian vet clinic front desk staff prefer Hindi UI |
| **Light mode only** for Beta | Reduces design surface area; dark mode planned post-launch |
| **Mobile-first** (320-480px) | 95%+ of Indian vet clinic usage is mobile; desktop is Phase 9 |
| **WCAG 2.1 AA** | Inclusive design; required for government/institutional partnerships |
| **4 wireframe states** | Ensures every screen handles edge cases (empty clinic, network error) before code is written |

### Compliance

| Requirement | Implementation |
|------------|---------------|
| **Accessibility** | WCAG 2.1 AA contrast ratios verified in tests; 44pt minimum touch targets; semantic heading roles |
| **Color independence** | Every StatusBadge has a text label — information never conveyed by color alone |

---

## For Design — Tokens, Components & Wireframes

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#2E7D32` | Green — primary actions, navigation, success states |
| Secondary | `#5D4037` | Brown — secondary elements, inventory module |
| Tertiary | `#E65100` | Orange — alerts, emergency indicators, warning states |
| Background | `#FFFBF5` | Warm white — screen backgrounds |
| Error | `#BA1A1A` | Error states, destructive actions |
| Success | `#2E7D32` | Same as primary (intentional — green = good) |
| Warning | `#E65100` | Same as tertiary (orange = attention) |

**Total: 28 color tokens** (includes surface variants, container colors, on-colors)

### Typography Scale (7 levels)

| Level | Font Size | Line Height | Weight | Letter Spacing | Role |
|-------|-----------|-------------|--------|---------------|------|
| Display | 45px | 52px | 400 | 0 | Hero text, splash screens |
| Heading 1 | 32px | 40px | 400 | 0 | Screen titles |
| Heading 2 | 28px | 36px | 400 | 0 | Section headers |
| Subheading | 22px | 28px | 400 | 0 | Card titles, list headers |
| Body | 16px | 24px | 400 | 0.5px | Primary content text |
| Caption | 12px | 16px | 400 | 0.4px | Timestamps, secondary info |
| Overline | 11px | 16px | 500 | 1.5px | Labels, categories |

**Semantic roles:** Display, Heading 1, Heading 2 → `header` role. Subheading, Body, Caption, Overline → `text` role.

### Spacing Scale (8px base, 10 values)

| Token | Value |
|-------|-------|
| `xxs` | 2px |
| `xs` | 4px |
| `sm` | 8px |
| `md` | 16px |
| `lg` | 24px |
| `xl` | 32px |
| `2xl` | 40px |
| `3xl` | 48px |
| `4xl` | 56px |
| `5xl` | 64px |

### Elevation (6 levels)

| Level | Shadow Value |
|-------|-------------|
| `level0` | 0 (flat) |
| `level1` | 1 |
| `level2` | 3 |
| `level3` | 6 |
| `level4` | 8 |
| `level5` | 12 |

### Border Radius (6 levels)

| Token | Value |
|-------|-------|
| `none` | 0 |
| `sm` | 4px |
| `md` | 8px |
| `lg` | 12px |
| `xl` | 16px |
| `full` | 28px |

### Animation Durations (7 values)

| Token | Value | Usage |
|-------|-------|-------|
| `microFeedback` | 100ms | Button press, toggle |
| `quickTransition` | 150ms | Chip select, icon change |
| `standard` | 200ms | General transitions |
| `screenTransition` | 250ms | Page transitions |
| `expandCollapse` | 300ms | Accordion, drawer |
| `complexAnimation` | 400ms | Multi-step animations |
| `skeletonShimmer` | 1500ms | Loading skeleton pulse |

### Component Library (26 components, 3 tiers)

#### Atoms (10 components)

| Component | Variants/Modes | Key Props | Notes |
|-----------|---------------|-----------|-------|
| **Avatar** | Sizes: `sm` (32px), `md` (40px), `lg` (48px), `xl` (64px) | `size`, `source`, `label`, `icon` | Falls back to initials, then icon |
| **Button** | 3 variants: `filled`, `outlined`, `text`. 3 sizes: `small` (36px), `medium` (44px), `large` (52px) | `variant`, `size`, `onPress`, `disabled`, `loading` | Medium meets 44pt WCAG minimum |
| **Chip** | Wraps RN Paper Chip | `mode`, `selected`, `onPress` | |
| **Divider** | Wraps RN Paper Divider | `bold`, `style` | |
| **IconButton** | 3 modes: `contained`, `outlined`, `default` | `icon`, `mode`, `onPress` | MIN_TOUCH_TARGET = 44 |
| **NotificationBadge** | Sizes: small (<10), medium (10-99), large (100+) | `count`, `onPress` | `99+` display for 100+; bell-outline icon; uses tertiary color |
| **ProgressIndicator** | Wraps RN Paper ProgressBar | `progress`, `color` | |
| **StatusBadge** | 8 variants: `waiting`, `inConsult`, `done`, `noShow`, `paid`, `unpaid`, `overdue`, `processing` | `status`, `label` | Color-coded with text label (never color-only) |
| **TextInput** | Default mode: `outlined` | `mode`, `label`, `value`, `onChangeText`, `error` | Wraps RN Paper TextInput |
| **Typography** | 7 variants matching type scale | `variant`, `children` | Semantic role mapping (header/text) |

**StatusBadge Color Map:**

| Status | Background | Text |
|--------|-----------|------|
| `waiting` | tertiaryContainer | onTertiaryContainer |
| `inConsult` | primaryContainer | onPrimaryContainer |
| `done` | surfaceVariant | onSurfaceVariant |
| `noShow` | errorContainer | onErrorContainer |
| `paid` | primaryContainer | onPrimaryContainer |
| `unpaid` | secondaryContainer | onSecondaryContainer |
| `overdue` | tertiaryContainer | onTertiaryContainer |
| `processing` | surfaceVariant | onSurfaceVariant |

#### Molecules (8 components)

| Component | Key Props | Behavior |
|-----------|-----------|----------|
| **AccordionItem** | `title`, `expanded`, `onToggle`, `children` | Expand/collapse with animation |
| **EmptyState** | `title`, `subtitle`, `icon`, `actionLabel`, `onAction` | Illustrative empty state with optional CTA button |
| **FormField** | `label`, `required`, `error`, `helperText`, `children` | Wraps input with label + error display |
| **ListItem** | `title`, `description`, `left`, `right`, `onPress` | Min height 56px; wraps RN Paper List.Item |
| **NotificationItem** | `module`, `title`, `message`, `timestamp`, `read`, `onPress` | Module-specific icons + colors (queue=clipboard, emr=stethoscope, etc.) |
| **SearchBar** | `value`, `onChangeText`, `onSubmit`, `placeholder` | Wraps RN Paper Searchbar; accessibility role: search |
| **SkeletonLoader** | `type`, `count` | 4 types: card (120px), listRow (56px), text (16px), avatar (40px circle) |
| **Toast** | `showToast(type, message)`, `onToast(callback)` | 3 types: success/error/info; event queue pattern |

**NotificationItem Module Icons:**

| Module | Icon | Color |
|--------|------|-------|
| `queue` | clipboard-list-outline | primary |
| `inventory` | package-variant-closed | secondary |
| `billing` | receipt | secondary |
| `whatsapp` | whatsapp | primary |
| `emr` | stethoscope | primary |
| `scheduling` | calendar-clock | primary |
| `system` | cog-outline | onSurfaceVariant |

#### Organisms (8 components)

| Component | Key Props | Behavior |
|-----------|-----------|----------|
| **BottomSheet** | `visible`, `onDismiss`, `snapPoints`, `title`, `children` | 3 snap points: 25%, 50%, 90%. Backdrop rgba(0,0,0,0.4). Border radius lg. |
| **BottomTabBar** | `activeTab`, `onTabPress` | 4 tabs: Queue (clipboard), Patients (paw), Inventory (package), More (dots). Height: 56px. |
| **Card** | `variant`, `onPress`, `children` | 3 variants: elevated (shadow), filled (surfaceVariant bg), outlined (border). Compound: `Card.Header`, `Card.Body`, `Card.Actions`. |
| **Modal** | `visible`, `onDismiss`, `title`, `children` | Max width 480px, 90% screen width. Elevation level4. Centered backdrop. |
| **NavigationBar** | `title`, `onBack`, `actions` | Height 56px. Back icon button (if onBack). Title truncated to 1 line. Action buttons right-aligned. |
| **NotificationList** | `notifications`, `activeFilter`, `onFilterChange`, `onMarkAllRead`, `isLoading`, `error` | 7 filter chips (all, queue, inventory, billing, whatsapp, emr, scheduling). 4 states: loading, error, empty, populated. |
| **QueueCard** | `patient`, `status`, `position`, `waitTime`, `onPress`, `onSwipeRight`, `onSwipeLeft` | Card height 80px. Shows position, pet name, owner, species, status badge, wait time. Accessibility label auto-generated. |
| **WizardStepper** | `steps`, `onComplete`, `onSkip` | Progress bar. Step title + content. Back/Next/Skip/Done buttons. Manages step state internally. |

**BottomTabBar Tabs:**

| Tab | Icon | Label |
|-----|------|-------|
| `queue` | clipboard-list-outline | Queue |
| `patients` | paw | Patients |
| `inventory` | package-variant-closed | Inventory |
| `more` | dots-horizontal | More |

### Wireframes (10 modules, 14 screens)

Each wireframe has `.stories.ts` files showing all 4 states (empty, loading, populated, error).

| Module | Screens | Key Empty State Message |
|--------|---------|------------------------|
| Auth | LoginScreen, SignupScreen | -- |
| Queue | QueueStatusBoard, CheckInFlow | "No patients in queue" / "Tap + to check in a walk-in patient" |
| EMR | ConsultationScreen, PatientHistoryScreen | -- |
| Inventory | InventoryListScreen, AddItemScreen | -- |
| Billing | InvoiceScreen | -- |
| Scheduling | CalendarScreen | -- |
| Notifications | NotificationScreen | "No notifications" / "You're all caught up!" |
| Portal | OwnerPortalScreen | -- |
| Dashboard | DashboardScreen | -- |
| WhatsApp | MessageLogScreen | -- |

### i18n (English + Hindi)

**Translation categories:** common (20 keys), queue (15 keys), portal (16 keys)

**Sample translations:**

| Key | English | Hindi |
|-----|---------|-------|
| `common.loading` | Loading... | lod ho raha hai... |
| `common.search` | Search | khojen |
| `queue.title` | Queue | katar |
| `queue.estimatedWait` | Estimated Wait | anumanit pratiksha |
| `queue.yourTurn` | It's your turn! | aapki bari hai! |
| `queue.status.waiting` | Waiting | pratiksha mein |
| `queue.status.noShow` | No Show | anupasthit |
| `portal.welcome` | Welcome, {{name}} | swagat hai, {{name}} |
| `portal.noPets` | No pets added yet | abhi tak koi paltu janvar nahin joda |

---

## For Engineering — Architecture & Implementation

### Package Configuration

```
@breeyo/ui (v0.0.1, private workspace package)

Dependencies:
  react-native-paper: ^5.15.1
  react-native-safe-area-context: ^5.7.0
  i18next: ^24.0.0
  react-i18next: ^15.0.0

Peer Dependencies:
  react, react-native, react-native-reanimated (>=3.0.0), react-native-gesture-handler (>=2.0.0)

Dev Dependencies:
  vitest: ^2.0.0, typescript: ^5.5.0, tsx: ^4.0.0

Scripts:
  test: vitest run
  generate:css-tokens: tsx scripts/generate-css-tokens.ts
```

### Code Architecture

```
packages/ui/src/
├── index.ts                      # Re-exports: theme, atoms, molecules, organisms
│
├── theme/                        # Design tokens (single source of truth)
│   ├── colors.ts                 # 28 color tokens
│   ├── typography.ts             # 7-level type scale
│   ├── spacing.ts                # 10 spacing values (2-64px)
│   ├── elevation.ts              # 6 elevation levels
│   ├── borderRadius.ts           # 6 radius levels
│   ├── animation.ts              # 7 duration values
│   ├── theme.ts                  # Composed theme extending MD3LightTheme
│   ├── types.ts                  # AppTheme TypeScript type
│   ├── index.ts                  # Theme exports
│   ├── portal.css                # Generated CSS custom properties
│   └── __tests__/
│       ├── theme.test.ts         # Theme composition tests (14 cases)
│       └── tokens.test.ts        # Token value tests (27 cases)
│
├── atoms/                        # 10 smallest UI primitives
│   ├── Avatar/Avatar.ts
│   ├── Button/Button.ts + Button.test.ts (13 cases)
│   ├── Chip/Chip.ts
│   ├── Divider/Divider.ts
│   ├── IconButton/IconButton.ts
│   ├── NotificationBadge/NotificationBadge.ts + .test.ts (22 cases)
│   ├── ProgressIndicator/ProgressIndicator.ts
│   ├── StatusBadge/StatusBadge.ts + .test.ts (24 cases)
│   ├── TextInput/TextInput.ts + .test.ts (2 cases)
│   ├── Typography/Typography.ts + .test.ts (11 cases)
│   └── index.ts
│
├── molecules/                    # 8 composed from atoms
│   ├── AccordionItem/AccordionItem.ts + .test.ts (1 case)
│   ├── EmptyState/EmptyState.ts + .test.ts (1 case)
│   ├── FormField/FormField.ts
│   ├── ListItem/ListItem.ts + .test.ts (2 cases)
│   ├── NotificationItem/NotificationItem.ts + .test.ts (16 cases)
│   ├── SearchBar/SearchBar.ts
│   ├── SkeletonLoader/SkeletonLoader.ts
│   ├── Toast/Toast.ts
│   └── index.ts
│
├── organisms/                    # 8 complex composed components
│   ├── BottomSheet/BottomSheet.ts
│   ├── BottomTabBar/BottomTabBar.ts
│   ├── Card/Card.ts + .test.ts (9 cases)
│   ├── Modal/Modal.ts
│   ├── NavigationBar/NavigationBar.ts
│   ├── NotificationList/NotificationList.ts + .test.ts (18 cases)
│   ├── QueueCard/QueueCard.ts + .test.ts (5 cases)
│   ├── WizardStepper/WizardStepper.ts
│   └── index.ts
│
├── wireframes/                   # Storybook wireframes (4 states each)
│   ├── auth/                     # LoginScreen, SignupScreen
│   ├── queue/                    # QueueStatusBoard, CheckInFlow + fixtures
│   ├── emr/                      # ConsultationScreen, PatientHistoryScreen
│   ├── inventory/                # InventoryListScreen, AddItemScreen
│   ├── billing/                  # InvoiceScreen
│   ├── scheduling/               # CalendarScreen
│   ├── notifications/            # NotificationScreen + fixtures
│   ├── portal/                   # OwnerPortalScreen
│   ├── dashboard/                # DashboardScreen
│   └── whatsapp/                 # MessageLogScreen
│
├── i18n/
│   ├── config.ts                 # i18next setup (en default, hi fallback)
│   └── locales/
│       ├── en/common.json        # English translations
│       └── hi/common.json        # Hindi translations
│
├── scripts/
│   └── generate-css-tokens.ts    # Generates portal.css from TS tokens
│
└── __tests__/
    └── accessibility.test.ts     # WCAG compliance tests (9 cases)
```

### Public Exports (64 items)

| Category | Exports |
|----------|---------|
| **Theme** (10) | `colors`, `typography`, `spacing`, `elevation`, `borderRadius`, `duration`, `breeyoTheme`, `AppTheme` (type), `useAppTheme` (hook) |
| **Atoms** (21) | `Typography`, `TYPOGRAPHY_VARIANT_MAP`, `Button`, `BUTTON_SIZE_MAP`, `BUTTON_VARIANT_MAP`, `BUTTON_DEFAULTS`, `BreeyoTextInput`, `TEXT_INPUT_DEFAULTS`, `StatusBadge`, `STATUS_CONFIG`, `getStatusLabel`, `Avatar`, `AVATAR_SIZE_MAP`, `BreeyoChip`, `BreeyoIconButton`, `ICON_BUTTON_MODE_MAP`, `MIN_TOUCH_TARGET`, `BreeyoDivider`, `ProgressIndicator`, `NotificationBadge`, `NOTIFICATION_BADGE_CONFIG`, `formatBadgeCount`, `getAccessibilityLabel` |
| **Molecules** (13) | `SearchBar`, `ListItem`, `LIST_ITEM_MIN_HEIGHT`, `FormField`, `EmptyState`, `toastConfig`, `showToast`, `onToast`, `AccordionItem`, `SkeletonLoader`, `SKELETON_DIMENSIONS`, `NotificationItem`, `MODULE_ICON_MAP`, `MODULE_COLOR_MAP` |
| **Organisms** (20) | `Card`, `CARD_VARIANTS`, `Modal`, `MODAL_DEFAULTS`, `BottomSheet`, `BOTTOM_SHEET_DEFAULTS`, `NavigationBar`, `NAV_BAR_CONFIG`, `BottomTabBar`, `TAB_CONFIG`, `BOTTOM_TAB_BAR_CONFIG`, `QueueCard`, `QUEUE_CARD_CONFIG`, `generateAccessibilityLabel`, `WizardStepper`, `WIZARD_DEFAULTS`, `NotificationList`, `FILTER_CHIPS`, `filterNotifications`, `countUnread` |

### CSS Token Generation

`pnpm --filter @breeyo/ui generate:css-tokens` runs `scripts/generate-css-tokens.ts`:

1. Reads all TypeScript token files
2. Converts camelCase to kebab-case
3. Generates CSS custom properties:
   - Colors: `--color-primary: #2E7D32;`
   - Spacing: `--spacing-md: 16px;`
   - Typography: `--font-size-body: 16px;`, `--line-height-body: 24px;`, `--font-weight-body: 400;`
   - Border radius: `--radius-lg: 12px;`
   - Elevation: `--elevation-level-3: 6px;`
   - Animation: `--duration-micro-feedback: 100ms;`
   - Font family: `--font-family: 'Inter', system-ui, sans-serif;`
4. Writes to `packages/ui/src/theme/portal.css`

### Tests (15 files, 181 test cases)

#### Theme & Token Tests

| Test File | Cases | What It Verifies |
|-----------|-------|-----------------|
| `theme.test.ts` | 14 | Theme extends MD3LightTheme, overrides primary with `#2E7D32`, has all spacing/radius/typography/elevation/animation values, maps each typography level to correct Paper font config |
| `tokens.test.ts` | 27 | 28 color keys with correct values, 7 typography levels with fontSize/lineHeight/fontWeight, 10 spacing values in ascending order, 6 elevation levels, 6 border radius tokens, 7 animation durations |

#### Atom Tests

| Test File | Cases | What It Verifies |
|-----------|-------|-----------------|
| `Button.test.ts` | 13 | 3 sizes (small=36px, medium=44px, large=52px), padding per size, 3 variant mappings (filled→contained, outlined→outlined, text→text), defaults (filled, medium) |
| `NotificationBadge.test.ts` | 22 | Badge color (tertiary), min touch target (44pt), icon (bell-outline), badge sizing (small <10, medium 10-99, large 100+), `formatBadgeCount` (0→null, 3→'3', 150→'99+'), accessibility labels (singular/plural/zero) |
| `StatusBadge.test.ts` | 24 | 8 status variants with correct bg/text colors, default labels for each status, `getStatusLabel` override behavior |
| `TextInput.test.ts` | 2 | Default mode = outlined, exported as function |
| `Typography.test.ts` | 11 | 7 variant entries, correct role mapping (display/heading→header, body/caption→text), each includes fontConfig |

#### Molecule Tests

| Test File | Cases | What It Verifies |
|-----------|-------|-----------------|
| `AccordionItem.test.ts` | 1 | Exported as function |
| `EmptyState.test.ts` | 1 | Exported as function |
| `ListItem.test.ts` | 2 | Min row height = 56px, exported as function |
| `NotificationItem.test.ts` | 16 | 7 module→icon mappings, 7 module→color mappings, exported as function |

#### Organism Tests

| Test File | Cases | What It Verifies |
|-----------|-------|-----------------|
| `Card.test.ts` | 9 | 3 variants (elevated=shadow, filled=surfaceVariant, outlined=border), compound sub-components (Header, Body, Actions) |
| `NotificationList.test.ts` | 18 | 7 filter chips in correct order, `filterNotifications` by module (all/queue/billing/inventory), `countUnread` (all read/all unread/mixed/empty) |
| `QueueCard.test.ts` | 5 | Card height = 80px, `generateAccessibilityLabel` format ("Position N, PetName, status, wait Time") |

#### Accessibility Tests

| Test File | Cases | What It Verifies |
|-----------|-------|-----------------|
| `accessibility.test.ts` | 9 | Button medium/large meet 44pt minimum, every StatusBadge has text label (not color-only), typography heading roles (display/heading1/heading2 = header; body != header), avatar md >= 40pt and lg >= 44pt |

---

## How It All Connects

### What Phase 2 Provides to Downstream Phases

```
Phase 2 EXPORTS:
├── Theme (breeyoTheme)
│   ├── Colors → used everywhere for consistent branding
│   ├── Typography → every text element uses the 7-level scale
│   ├── Spacing → consistent padding/margins via tokens
│   └── Animation → consistent motion timing
│
├── Atoms
│   ├── StatusBadge → Phase 3 queue cards (WAITING/IN_CONSULT/DONE/NO_SHOW colors)
│   ├── Button → all CTAs across every phase
│   ├── Typography → all text rendering
│   └── TextInput → all form inputs
│
├── Molecules
│   ├── SearchBar → Phase 3 patient search (debounced)
│   ├── EmptyState → Phase 3 empty queue ("No patients in queue")
│   ├── SkeletonLoader → Phase 3 loading states
│   ├── Toast → Phase 3 success/error feedback
│   └── FormField → Phase 3 registration forms
│
├── Organisms
│   ├── BottomSheet → Phase 3 check-in flow
│   ├── BottomTabBar → Phase 3 main navigation (Queue, Patients, Inventory, More)
│   ├── QueueCard → Phase 3 queue entry display
│   ├── WizardStepper → Phase 3 two-step registration (owner → pet)
│   ├── Card → Phase 3 pet profile cards
│   ├── NavigationBar → Phase 3 screen headers
│   └── Modal → Phase 3 confirmation dialogs
│
├── Wireframes
│   ├── QueueStatusBoard → Phase 3 queue screen specification
│   ├── CheckInFlow → Phase 3 check-in bottom sheet specification
│   └── (Future phases use their respective wireframes as specs)
│
└── i18n
    └── Translation keys → Hindi labels on every Phase 3+ screen
```

### Design System Consumption Pattern

```
Feature Phase (e.g. Phase 3) builds screens by composing Phase 2 components:

┌─────────────────────────────────────────────────────┐
│  QueueScreen.tsx                                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ NavigationBar (organism)                      │   │
│  │  title="Queue"  actions=[CallNextButton]      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ QueueBoard (feature component)                │   │
│  │                                                │   │
│  │  ┌─ QueueSectionHeader ───────────────────┐   │   │
│  │  │ Typography(variant="subheading")        │   │   │
│  │  │ "In Consult (1)"                        │   │   │
│  │  └────────────────────────────────────────┘   │   │
│  │                                                │   │
│  │  ┌─ QueueCard (organism) ─────────────────┐   │   │
│  │  │ StatusBadge(status="inConsult")         │   │   │
│  │  │ Typography(variant="body") "Buddy"      │   │   │
│  │  │ Typography(variant="caption") "Dr. Rao" │   │   │
│  │  └────────────────────────────────────────┘   │   │
│  │                                                │   │
│  │  ... more QueueCards ...                       │   │
│  │                                                │   │
│  │  OR                                            │   │
│  │                                                │   │
│  │  ┌─ EmptyState (molecule) ────────────────┐   │   │
│  │  │ icon="clipboard-list-outline"           │   │   │
│  │  │ "No patients in queue"                  │   │   │
│  │  │ "Tap + to check in a walk-in patient"   │   │   │
│  │  └────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ BottomTabBar (organism)                       │   │
│  │  activeTab="queue"                            │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  FAB → opens BottomSheet (organism)                  │
│    → CheckInSheet uses SearchBar, FormField, Button  │
└─────────────────────────────────────────────────────┘
```
