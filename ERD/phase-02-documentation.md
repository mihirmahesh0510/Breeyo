# Breeyo ERD: Phase 2 — UI/UX Design & Design System

## Phase 2: UI/UX Design & Design System

### Phase 2 Product Features

Phase 2 establishes the **visual and interaction foundation** for the entire Breeyo app. It does **not add any database models** — it builds the component library, design tokens, and wireframes that all subsequent feature phases consume.

**What it delivers:**

- **Design token system** — Colors, typography (7-level scale), spacing (8px base), elevation, border radius, animation timing
- **26-component library** organized in atomic design (atoms > molecules > organisms)
- **Wireframe stories** for every major module (queue, EMR, inventory, billing, scheduling, notifications, portal) showing all 4 states: empty, loading, populated, error
- **i18n support** — English and Hindi translations via i18next
- **Accessibility** — WCAG 2.1 AA compliance, 4.5:1 contrast ratios, 44x44pt tap targets

### Phase 2 Code Architecture

```
packages/ui/
├── src/
│   ├── theme/                     # Design tokens
│   │   ├── colors.ts              # Primary (#2E7D32), Secondary (#5D4037), Tertiary (#E65100)
│   │   ├── typography.ts          # 7-level scale: Display → Overline
│   │   ├── spacing.ts             # 8px base: 8, 16, 24, 32, 40, 48, 56, 64
│   │   ├── elevation.ts           # Shadow/elevation levels
│   │   ├── borderRadius.ts        # Rounded corners
│   │   ├── animation.ts           # Motion timing
│   │   ├── theme.ts               # Composed theme object
│   │   ├── types.ts               # Theme TypeScript types
│   │   └── __tests__/             # Theme + token tests
│   │
│   ├── atoms/                     # Smallest UI primitives
│   │   ├── Avatar/
│   │   ├── Button/                # 3 variants: filled, outlined, text
│   │   ├── Chip/
│   │   ├── Divider/
│   │   ├── IconButton/
│   │   ├── NotificationBadge/
│   │   ├── ProgressIndicator/
│   │   ├── StatusBadge/           # Queue status indicators (Waiting, In Consult, Done, No Show)
│   │   ├── TextInput/
│   │   └── Typography/            # 7-level type scale
│   │
│   ├── molecules/                 # Composed from atoms
│   │   ├── AccordionItem/
│   │   ├── EmptyState/            # Illustrative empty states with action buttons
│   │   ├── FormField/
│   │   ├── ListItem/
│   │   ├── NotificationItem/
│   │   ├── SearchBar/             # Debounced search with clear action
│   │   ├── SkeletonLoader/        # Shimmer loading placeholders
│   │   └── Toast/                 # Success/error feedback popups
│   │
│   ├── organisms/                 # Complex composed components
│   │   ├── BottomSheet/           # Slide-up panels (check-in flow)
│   │   ├── BottomTabBar/          # Primary navigation: Queue, Patients, Inventory, More
│   │   ├── Card/                  # Compound component: Card.Header, Card.Body
│   │   ├── Modal/
│   │   ├── NavigationBar/
│   │   ├── NotificationList/
│   │   ├── QueueCard/             # Queue entry card with status badge
│   │   └── WizardStepper/        # Multi-step form wizard
│   │
│   ├── wireframes/               # Hi-fidelity wireframe stories
│   │   ├── auth/                  # LoginScreen, SignupScreen
│   │   ├── queue/                 # QueueStatusBoard, CheckInFlow
│   │   ├── emr/                   # ConsultationScreen, PatientHistoryScreen
│   │   ├── inventory/             # InventoryListScreen, AddItemScreen
│   │   ├── billing/               # InvoiceScreen
│   │   ├── scheduling/            # CalendarScreen
│   │   ├── notifications/         # NotificationScreen
│   │   ├── portal/                # OwnerPortalScreen
│   │   ├── dashboard/             # DashboardScreen
│   │   └── whatsapp/              # MessageLogScreen
│   │
│   └── i18n/
│       ├── config.ts
│       └── locales/
│           ├── en/common.json     # English translations
│           └── hi/common.json     # Hindi translations
```

### Design Tokens & Theme System

**Color Palette (Warm & Friendly — differentiates from clinical human healthcare):**

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#2E7D32` | Green — primary actions, navigation |
| Secondary | `#5D4037` | Brown — secondary elements |
| Tertiary | `#E65100` | Orange — alerts, emergency indicators |
| Background | `#FFFBF5` | Warm white — screen backgrounds |

**Typography Scale (7 levels):**

| Level | Usage |
|-------|-------|
| Display | Hero text, splash screens |
| Heading 1 | Screen titles |
| Heading 2 | Section headers |
| Subheading | Card titles, list headers |
| Body | Primary content text |
| Caption | Timestamps, secondary info |
| Overline | Labels, categories |

**Spacing (8px base grid):** 8, 16, 24, 32, 40, 48, 56, 64px

**Key Design Decisions:**
- Material Design 3 foundation via React Native Paper v5
- Light mode only for Beta
- Mobile-first breakpoints (320-480px)
- Controlled components with explicit state management
- Compound component pattern (e.g., `<Card><Card.Header/><Card.Body/></Card>`)
- Context-based theming for hot-swappable theme support

### Component Library

**26 components across 3 tiers:**

| Tier | Components | Count |
|------|-----------|-------|
| Atoms | Avatar, Button, Chip, Divider, IconButton, NotificationBadge, ProgressIndicator, StatusBadge, TextInput, Typography | 10 |
| Molecules | AccordionItem, EmptyState, FormField, ListItem, NotificationItem, SearchBar, SkeletonLoader, Toast | 8 |
| Organisms | BottomSheet, BottomTabBar, Card, Modal, NavigationBar, NotificationList, QueueCard, WizardStepper | 8 |

### Wireframes & Storybook

Each wireframe module has `.stories.ts` files showing all 4 states:

| Module | Stories | States |
|--------|---------|--------|
| Auth | LoginScreen, SignupScreen | empty, loading, populated, error |
| Queue | QueueStatusBoard, CheckInFlow | empty, loading, populated, error |
| EMR | ConsultationScreen, PatientHistoryScreen | empty, loading, populated, error |
| Inventory | InventoryListScreen, AddItemScreen | empty, loading, populated, error |
| Billing | InvoiceScreen | empty, loading, populated, error |
| Scheduling | CalendarScreen | empty, loading, populated, error |
| Notifications | NotificationScreen | empty, loading, populated, error |
| Portal | OwnerPortalScreen | empty, loading, populated, error |
| Dashboard | DashboardScreen | empty, loading, populated, error |
| WhatsApp | MessageLogScreen | empty, loading, populated, error |

### Phase 2 Tests

| Test File | What It Tests |
|-----------|--------------|
| `packages/ui/src/atoms/Button/Button.test.ts` | Button variants (filled, outlined, text), press handlers, disabled state |
| `packages/ui/src/atoms/TextInput/TextInput.test.ts` | Input rendering, value changes, error display |
| `packages/ui/src/atoms/Typography/Typography.test.ts` | Typography scale rendering, style application |
| `packages/ui/src/atoms/StatusBadge/StatusBadge.test.ts` | Status badge colors, labels for each queue status |
| `packages/ui/src/atoms/NotificationBadge/NotificationBadge.test.ts` | Badge count display, visibility |
| `packages/ui/src/molecules/EmptyState/EmptyState.test.ts` | Empty state rendering with illustration and CTA |
| `packages/ui/src/molecules/ListItem/ListItem.test.ts` | List item rendering, press handlers |
| `packages/ui/src/molecules/AccordionItem/AccordionItem.test.ts` | Expand/collapse behavior |
| `packages/ui/src/molecules/NotificationItem/NotificationItem.test.ts` | Notification display, read/unread states |
| `packages/ui/src/organisms/Card/Card.test.ts` | Card compound component rendering |
| `packages/ui/src/organisms/QueueCard/QueueCard.test.ts` | Queue card with status badge, pet info, owner info |
| `packages/ui/src/organisms/NotificationList/NotificationList.test.ts` | Notification list rendering, empty state |
| `packages/ui/src/theme/__tests__/theme.test.ts` | Theme object structure, color accessibility |
| `packages/ui/src/theme/__tests__/tokens.test.ts` | Token values, spacing scale, typography scale |
| `packages/ui/src/__tests__/accessibility.test.ts` | WCAG 2.1 AA contrast ratios, tap target sizes |

