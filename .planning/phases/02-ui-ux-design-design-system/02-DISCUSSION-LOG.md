# Phase 2: UI/UX Design & Design System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 02-ui-ux-design-design-system
**Areas discussed:** Design Philosophy & Visual Language, Component Architecture, Mobile Navigation & Interaction, Wireframes & Information Density

---

## Design Philosophy & Visual Language

### What design system philosophy should guide Breeyo?

| Option | Description | Selected |
|--------|-------------|----------|
| Material Design 3 (Recommended) | Google's design system — familiar to Android users, comprehensive component library, well-documented, reduces decision fatigue. Best for quick iteration. | ✓ |
| Custom minimalist system | Purpose-built for vet workflows — stripped-down, fast, opinionated for medical context. More design work upfront but tailored to solo vets. | |
| Hybrid Material + custom | Material Design base with custom medical-context overrides — balance between familiarity and tailoring. | |

**User's choice:** Material Design 3 (Recommended)

---

### What color palette approach fits Breeyo's context?

| Option | Description | Selected |
|--------|-------------|----------|
| Clinical blues & whites | Medical/clinical association — trustworthy, professional, familiar to healthcare context. Risk: feels cold or institutional. | |
| Warm & friendly tones (Recommended) | Approachable greens/oranges/soft blues — veterinary care is about compassion, not clinical sterility. Differentiate from human medicine. | ✓ |
| Neutral professional | Grays, blacks, minimal color — clean, modern, gets out of the way. Risk: feels generic or corporate. | |

**User's choice:** Warm & friendly tones (Recommended)

---

### How many typography levels should the scale have?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 levels (Recommended) | Display, Heading, Subheading, Body, Caption — minimal but sufficient for mobile-first app. Keeps things simple. | |
| 7 levels (full scale) | More granularity for complex screens — useful for data-heavy EMR and inventory views. More design decisions needed. | ✓ |
| You decide | Claude picks the right scale based on screen complexity needs discovered during wireframing. | |

**User's choice:** 7 levels (full scale)

---

### What spacing scale and elevation approach?

| Option | Description | Selected |
|--------|-------------|----------|
| 8px base scale (Recommended) | Standard 8px grid (8, 16, 24, 32, 40...) — aligns with Material Design, works well for tap targets. Industry default. | ✓ |
| 4px base scale | More granular control (4, 8, 12, 16, 20...) — useful for dense layouts but can lead to inconsistency if overused. | |
| You decide | Claude picks spacing that optimizes for mobile tap targets (44x44pt minimum) and one-handed use. | |

**User's choice:** 8px base scale (Recommended)

---

### What iconography style fits Breeyo?

| Option | Description | Selected |
|--------|-------------|----------|
| Material Icons (Recommended) | Google's icon set — 2000+ icons, consistent with Material Design 3, familiar to users. Covers most needs out of box. | |
| Custom veterinary icons | Purpose-built icon set for vet workflows — pet silhouettes, medical symbols, etc. More work but highly contextual. | |
| Hybrid approach | Material Icons base + custom vet-specific icons where Material doesn't have good matches. | ✓ |

**User's choice:** Hybrid approach

---

### Should the design system support dark mode from day one?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes - design system includes dark theme | Dark mode tokens defined now, components built with theme support. Vets may prefer dark mode for late-night emergencies. More design work upfront. | |
| No - light mode only for Beta (Recommended) | Ship faster with single theme, add dark mode post-Beta if users request it. Most vet work happens during daylight clinic hours. | ✓ |
| You decide | Claude evaluates if dark mode is critical for primary workflows (walk-in queue, EMR). | |

**User's choice:** No - light mode only for Beta (Recommended)

---

### What accessibility standards should the design system follow?

| Option | Description | Selected |
|--------|-------------|----------|
| WCAG 2.1 AA (Recommended) | Industry standard for accessible web/mobile apps — color contrast 4.5:1, keyboard nav, screen reader support. Meets most accessibility needs. | ✓ |
| Basic accessibility only | Tap target sizes, clear labels, readable fonts — no formal WCAG compliance. Faster to build but may limit market reach. | |
| You decide | Claude optimizes for low-literacy users (clear iconography, large tap targets) and basic screen reader support. | |

**User's choice:** WCAG 2.1 AA (Recommended)

---

### What responsive breakpoints for mobile → tablet → web?

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile-first only (Recommended) | Single mobile layout (320-480px) that scales up — simplest, fastest. Tablet/web views come in Phase 9 (Web Dashboard). Solo vets use phones. | ✓ |
| Mobile + tablet breakpoints | Mobile (320-480px) + tablet (768-1024px) breakpoints defined now. Some vets may use iPads. More design/testing work. | |
| You decide | Claude picks breakpoints based on user research (Phase 1 context: mid-range Android phones are primary device). | |

**User's choice:** Mobile-first only (Recommended)

---

### What animation and motion design approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal functional motion (Recommended) | Only essential animations (loading states, transitions, success/error feedback) — keeps app feeling fast and responsive. No decorative motion. | |
| Expressive Material motion | Full Material Design motion system (enter/exit animations, shared element transitions, spring physics) — polished but can feel slow on mid-range Android. | |
| You decide | Claude balances motion for delight vs performance on mid-range Android 8+ devices (primary target). | ✓ |

**User's choice:** You decide
**Notes:** Claude should optimize animation/motion for mid-range Android 8+ device performance while maintaining essential feedback

---

### What form design patterns for data-heavy medical workflows?

| Option | Description | Selected |
|--------|-------------|----------|
| Step-by-step wizards (Recommended) | Break long forms into multiple steps with progress indicators — reduces cognitive load, works well on mobile. Used in patient registration, EMR consultations. | ✓ |
| Single-page scrollable forms | All fields on one page — faster for experienced users who know the flow. Risk: overwhelming for low-literacy users. | |
| Contextual inline forms | Fields appear inline with context (e.g., tap to add vitals in EMR) — minimal but requires careful UX. Most compact. | |

**User's choice:** Step-by-step wizards (Recommended)

---

### How should error states be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline contextual errors (Recommended) | Errors appear next to the field/action that failed — clear, immediate, doesn't block flow. Banner for critical system errors. Best for mobile. | ✓ |
| Modal dialogs for all errors | Every error shows a dialog that must be dismissed — impossible to miss but interrupts flow. Can feel heavy-handed. | |
| Toast notifications | Brief bottom popups that auto-dismiss — subtle, non-blocking. Risk: critical errors might be missed. | |

**User's choice:** Inline contextual errors (Recommended)

---

### What empty state patterns for walk-in queue, EMR, inventory?

| Option | Description | Selected |
|--------|-------------|----------|
| Illustrative empty states (Recommended) | Custom illustrations + helpful text + primary action — guides first-time users, reduces confusion. Friendly tone for low-literacy users. | ✓ |
| Minimal text-only | Simple "No patients yet" message + action button — fast to build, gets out of the way. Less hand-holding. | |
| You decide | Claude designs empty states that match the screen's importance (walk-in queue gets full treatment, secondary screens minimal). | |

**User's choice:** Illustrative empty states (Recommended)

---

### What loading state patterns?

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton screens (Recommended) | Content-shaped placeholders that animate — feels faster, shows structure, reduces perceived wait time. Material Design best practice. | |
| Spinners/progress indicators | Classic loading spinner or progress bar — simple, universally understood, but doesn't show what's loading. | |
| You decide | Claude picks skeleton screens for data-heavy screens (queue, EMR list) and spinners for quick actions (submit, save). | ✓ |

**User's choice:** You decide
**Notes:** Claude should use skeleton screens for data-heavy screens and spinners for quick actions

---

### How should success feedback be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| Toast notifications (Recommended) | Brief bottom popups that auto-dismiss after 2-3 seconds — non-intrusive, doesn't block flow. Standard for successful saves, updates. | ✓ |
| Inline success messages | Green checkmark + text next to the action — subtle, contextual. Better for multi-step forms where user needs to see each step succeeded. | |
| Modal success dialogs | Full dialog celebrating success — clear but interrupts flow. Only for major milestones (patient registered, invoice paid). | |

**User's choice:** Toast notifications (Recommended)

---

### What button emphasis hierarchy?

| Option | Description | Selected |
|--------|-------------|----------|
| 3-level hierarchy (Recommended) | Filled (primary action), Outlined (secondary), Text (tertiary) — clear visual priority. Material Design standard. | ✓ |
| 2-level hierarchy | Filled (primary) + Text (secondary) only — simpler, less decision fatigue. Outlined buttons skipped. | |
| You decide | Claude picks button emphasis based on action importance (e.g., "Save Patient" is filled, "Cancel" is text-only). | |

**User's choice:** 3-level hierarchy (Recommended)

---

## Component Architecture

### What component API philosophy?

| Option | Description | Selected |
|--------|-------------|----------|
| Controlled components (Recommended) | Explicit state management — parent controls value, onChange handlers required. More boilerplate but predictable, easier to debug. React/React Native standard. | ✓ |
| Uncontrolled components | Components manage their own state — less boilerplate, faster to use. Harder to coordinate complex forms or multi-step wizards. | |
| Hybrid approach | Support both controlled and uncontrolled modes — flexibility but more complexity in component implementation. | |

**User's choice:** Controlled components (Recommended)

---

### What composition pattern for complex components?

| Option | Description | Selected |
|--------|-------------|----------|
| Compound components (Recommended) | Flexible composition via subcomponents (e.g., <Card><Card.Header/><Card.Body/></Card>) — declarative, customizable. Material UI/Radix pattern. | ✓ |
| Prop-driven configuration | Single component with many props (e.g., <Card header=... body=... footer=...>) — simple, less flexible. Good for repetitive patterns. | |
| You decide | Claude picks compound components for flexible UI (cards, lists) and prop-driven for repetitive elements (status badges, chips). | |

**User's choice:** Compound components (Recommended)

---

### How should component variants be defined?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit variant props (Recommended) | Named variants via props (e.g., variant="filled\|outlined\|text", size="small\|medium\|large") — type-safe, discoverable, self-documenting. TypeScript-friendly. | ✓ |
| Style props | Direct styling props (e.g., backgroundColor, fontSize) — maximum flexibility but inconsistent use across app. Risk of design system drift. | |
| CSS/style modifiers | Class-based variants (e.g., className="card-elevated") — familiar to web devs but less discoverable, not type-safe. | |

**User's choice:** Explicit variant props (Recommended)

---

### What theming strategy for component library?

| Option | Description | Selected |
|--------|-------------|----------|
| Context-based theming (Recommended) | React Context provides theme tokens to all components — standard React pattern, hot-swappable themes. Used by Material UI, Chakra, etc. | ✓ |
| Static design tokens only | No runtime theming — tokens compiled at build time. Simpler, faster, but can't support user theme switching. | |
| You decide | Claude picks theming strategy based on whether multiple themes needed (light mode only for Beta = static tokens acceptable). | |

**User's choice:** Context-based theming (Recommended)

---

### What component testing strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual regression tests (Recommended) | Screenshot comparison tests (e.g., Chromatic, Storybook) — catches visual regressions, ensures variants render correctly. Gold standard for design systems. | ✓ |
| Unit tests only | Test component logic/behavior with Jest/Testing Library — faster to write, but doesn't catch visual bugs. Good for behavior, not styling. | |
| Manual QA only | No automated component tests — fastest initially but regression risk increases as library grows. Relies on manual testing. | |

**User's choice:** Visual regression tests (Recommended)

---

### How should components be documented?

| Option | Description | Selected |
|--------|-------------|----------|
| Storybook catalog (Recommended) | Interactive component explorer with all variants, props, usage examples — industry standard. Doubles as visual regression test baseline. | ✓ |
| Markdown docs | Simple markdown files describing props and usage — lightweight, version-controlled. Less interactive, requires manual updates. | |
| TypeScript types only | Component interfaces document themselves via TypeScript — minimal docs, relies on IDE intellisense. Less accessible to non-TS users. | |

**User's choice:** Storybook catalog (Recommended)

---

### How should the component library be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic design structure (Recommended) | Atoms (Button, Input) → Molecules (SearchBar) → Organisms (PatientCard) — clear hierarchy, scalable. Brad Frost methodology. | ✓ |
| Flat by component type | All components in single directory by type (inputs/, feedback/, layout/) — simpler, easier to navigate when library is small. | |
| You decide | Claude picks structure that balances discoverability (for small library now) and scalability (for future growth). | |

**User's choice:** Atomic design structure (Recommended)

---

### What prop naming conventions?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard React conventions (Recommended) | Follow React/React Native naming (onChange, onPress, disabled, children) — familiar, matches ecosystem. Predictable for developers. | ✓ |
| Custom semantic names | Domain-specific prop names (e.g., onPatientSelect instead of onChange) — more readable in context but inconsistent with ecosystem. | |
| You decide | Claude follows standard React conventions for consistency, uses semantic names only when clarity demands it. | |

**User's choice:** Standard React conventions (Recommended)

---

### How should accessibility be integrated into components?

| Option | Description | Selected |
|--------|-------------|----------|
| Built-in by default (Recommended) | All components ship with ARIA labels, roles, keyboard nav built-in — developers can't forget. Matches WCAG 2.1 AA standard from earlier. | ✓ |
| Optional a11y props | Accessibility via opt-in props (aria-label, etc.) — more flexible but easy to forget. Risk of incomplete accessibility. | |
| You decide | Claude balances built-in defaults (screen reader support, keyboard nav) with flexibility for custom cases. | |

**User's choice:** Built-in by default (Recommended)

---

## Mobile Navigation & Interaction

### What primary mobile navigation pattern?

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom tab bar (Recommended) | Fixed tabs at bottom (Queue, Patients, Inventory, More) — thumb-friendly, industry standard for mobile-first apps. Easy one-handed use. | ✓ |
| Side drawer | Hamburger menu with slide-out drawer — saves screen space, hides complexity. Requires two-handed interaction (swipe or tap hamburger). | |
| Hybrid (tabs + drawer) | Bottom tabs for primary (Queue, Patients) + drawer for secondary (Settings, Reports) — best of both but more complex nav model. | |

**User's choice:** Bottom tab bar (Recommended)

---

### What gesture patterns should be supported?

| Option | Description | Selected |
|--------|-------------|----------|
| Essential gestures only (Recommended) | Swipe to delete/archive, pull-to-refresh, tap to select — standard mobile patterns. No advanced gestures (pinch, long-press menus). Keeps UX simple for low-literacy users. | |
| Rich gesture vocabulary | Full gesture set (swipe, long-press, pinch-zoom, drag-drop) — power user friendly but harder to discover. May overwhelm solo vets. | |
| You decide | Claude limits gestures to universally understood patterns (swipe, pull-to-refresh) and provides visible affordances for all actions. | ✓ |

**User's choice:** You decide
**Notes:** Claude should limit to essential gestures with visible affordances

---

### What screen transition patterns?

| Option | Description | Selected |
|--------|-------------|----------|
| Stack navigation (Recommended) | Screens slide in/out horizontally with back button — standard mobile pattern, clear hierarchy, easy to understand. React Navigation default. | ✓ |
| Modal overlays | Screens slide up from bottom as modals — good for quick tasks (add patient, update stock) but breaks navigation stack. Use sparingly. | |
| You decide | Claude uses stack nav for main flows (queue → patient → consultation) and modals for quick actions (check-in, quick add). | |

**User's choice:** Stack navigation (Recommended)

---

### What minimum tap target size?

| Option | Description | Selected |
|--------|-------------|----------|
| 44x44pt minimum (Recommended) | Apple Human Interface Guidelines standard — accessible for most users, industry best practice. Matches WCAG AA touch target requirements. | ✓ |
| 48x48dp minimum | Android Material Design standard — slightly larger, even more accessible. Better for older users or motor impairments. | |
| You decide | Claude picks 44x44pt minimum (iOS standard) as baseline, increases to 48x48dp for critical actions (check-in button, save patient). | |

**User's choice:** 44x44pt minimum (Recommended)

---

### How should back button behavior work?

| Option | Description | Selected |
|--------|-------------|----------|
| Hardware back = nav back (Recommended) | Android hardware back button follows navigation stack — native Android behavior, expected by users. iOS swipe-from-edge does the same. | ✓ |
| Hardware back = app minimize | Back button exits screens to home, then minimizes app — non-standard, may confuse users. Not recommended for medical app. | |
| You decide | Claude follows platform conventions (hardware back = nav back on Android, swipe = back on iOS). | |

**User's choice:** Hardware back = nav back (Recommended)

---

### Should primary actions use floating action buttons (FABs)?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes - FABs for primary actions (Recommended) | Floating "Check In Patient" button on queue, "Add Item" on inventory — thumb-accessible, Material Design pattern. Always visible. | ✓ |
| No - inline buttons only | Actions in toolbar or inline with content — cleaner, less visual clutter. May require scrolling to reach action. | |
| You decide | Claude uses FABs for frequent primary actions (check-in, add) and inline buttons for secondary actions. | |

**User's choice:** Yes - FABs for primary actions (Recommended)

---

## Wireframes & Information Density

### What wireframe fidelity level for Phase 2 deliverables?

| Option | Description | Selected |
|--------|-------------|----------|
| Mid-fidelity layouts (Recommended) | Grayscale layouts with real content, component outlines, spacing, typography — clear enough for planning, faster than hi-fi. Figma/Sketch standard. | |
| Lo-fidelity sketches | Boxes and flows only — fastest, flexible, but leaves many decisions ambiguous. Requires more interpretation during implementation. | |
| Hi-fidelity prototypes | Full-color, interactive, production-ready designs — pixel-perfect but slowest. More design work than needed for Beta. | ✓ |

**User's choice:** Hi-fidelity prototypes
**Notes:** Full-color, interactive, production-ready designs for maximum clarity

---

### What information density strategy for different screens?

| Option | Description | Selected |
|--------|-------------|----------|
| Context-adaptive density (Recommended) | Walk-in queue: spacious (clarity, quick glance). EMR: compact (lots of medical data). Inventory: balanced (scannable lists). Density matches workflow needs. | ✓ |
| Consistently spacious | All screens use generous whitespace — easier to scan, less overwhelming. Risk: too much scrolling for data-heavy EMR and inventory. | |
| Consistently compact | All screens maximize info on-screen — less scrolling for power users. Risk: overwhelming for low-literacy users, harder to parse. | |

**User's choice:** Context-adaptive density (Recommended)

---

### Should wireframes show all screen states?

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 states per screen (Recommended) | Empty, Loading, Populated, Error states wireframed for every screen — complete UX coverage, no ambiguity for planners. Matches ROADMAP requirement. | ✓ |
| Primary state only | Only populated state wireframed — faster, but empty/loading/error states decided during implementation. Risk: inconsistent patterns. | |
| You decide | Claude wireframes all states for critical screens (queue, EMR) and primary state only for secondary screens (settings, reports). | |

**User's choice:** All 4 states per screen (Recommended)

---

### How should navigation flows be documented in wireframes?

| Option | Description | Selected |
|--------|-------------|----------|
| Annotated flow diagrams (Recommended) | Wireframes connected with arrows showing user journeys (e.g., Queue → Check-in → Consultation → Invoice). Clear paths for all major workflows. | |
| Screen-by-screen only | Individual wireframes without flow connections — simpler, but navigation logic must be inferred. Risk: unclear transitions. | |
| You decide | Claude creates flow diagrams for complex workflows (queue → consultation, inventory scan → update) and individual screens for settings. | ✓ |

**User's choice:** You decide
**Notes:** Claude should create flow diagrams for complex workflows, individual screens for simpler areas

---

### How should content be prioritized on small screens?

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive disclosure (Recommended) | Show essential info first, hide secondary details behind taps/expand — reduces cognitive load. EMR shows summary, tap for full SOAP notes. | ✓ |
| Everything visible | All info on-screen, scroll to see more — complete context but can overwhelm. Long scrolls on mobile. | |
| You decide | Claude uses progressive disclosure for data-heavy screens (EMR, patient history) and full visibility for simple screens (queue, settings). | |

**User's choice:** Progressive disclosure (Recommended)

---

### How should walk-in queue real-time updates be wireframed?

| Option | Description | Selected |
|--------|-------------|----------|
| Status board with live badges (Recommended) | Queue shown as card list with live status badges (Waiting, In Consult, Done) and position numbers. Animates when status changes. Matches real clinic whiteboards. | ✓ |
| List with refresh indicator | Simple list that updates in background, shows refresh indicator when changes occur — simpler but less immediate visual feedback. | |
| You decide | Claude designs queue UX to feel like a living status board that vets can glance at, optimized for one-handed use while holding an animal. | |

**User's choice:** Status board with live badges (Recommended)

---

## Claude's Discretion

- Animation/motion design — balance functional motion for speed vs expressive motion for delight, optimized for mid-range Android 8+ performance
- Loading state patterns — skeleton screens for data-heavy screens, spinners for quick actions
- Gesture patterns — essential gestures only (swipe, pull-to-refresh, tap) with visible affordances
- Navigation flow documentation — flow diagrams for complex workflows, individual screens for simpler areas
- Exact elevation/shadow system values
- Border radius values for cards, buttons, modals
- Animation timing curves and durations
- Specific color hex values within warm & friendly palette (ensuring WCAG 2.1 AA contrast)
- Icon selection for custom veterinary symbols
- Compression and retention policies for Storybook assets

---

*Generated by /gsd:discuss-phase on 2026-04-17*
