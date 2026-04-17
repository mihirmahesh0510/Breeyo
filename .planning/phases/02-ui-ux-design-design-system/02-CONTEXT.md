# Phase 2: UI/UX Design & Design System - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Establishing a complete design system with design tokens, reusable component library, screen flow wireframes, and mobile-first UX patterns. This phase creates the visual and interaction foundation that all subsequent feature phases (queue, EMR, inventory, billing, etc.) will build upon. Delivers: design token file, component library (Button, TextInput, Card, ListItem, Modal, BottomSheet, NavigationBar, StatusBadge), Storybook catalog, and hi-fidelity wireframes for all major modules showing all states (empty, loading, populated, error).

</domain>

<decisions>
## Implementation Decisions

### Design Philosophy & Core System
- **D-01:** Material Design 3 as the design system foundation — comprehensive component library, well-documented, familiar to Android users, reduces decision fatigue
- **D-02:** Warm & friendly color palette (approachable greens/oranges/soft blues) — veterinary care is about compassion, not clinical sterility. Differentiate from human medicine
- **D-03:** 7-level typography scale (more granularity for complex screens) — Display, Heading 1, Heading 2, Subheading, Body, Caption, Overline. Supports data-heavy EMR and inventory views
- **D-04:** 8px base spacing scale (8, 16, 24, 32, 40, 48, 56, 64px) — aligns with Material Design, optimizes for 44x44pt tap targets, industry standard
- **D-05:** Light mode only for Beta — single theme ships faster, most vet work happens during daylight clinic hours. Dark mode deferred to post-Beta if requested
- **D-06:** WCAG 2.1 AA accessibility standards — 4.5:1 color contrast, keyboard navigation, screen reader support. Meets accessibility needs for semi-urban practitioners
- **D-07:** Mobile-first only breakpoints (320-480px) — single mobile layout that scales up. Tablet/web views come in Phase 9 (Web Dashboard). Solo vets use phones primarily

### Iconography & Visual Elements
- **D-08:** Hybrid iconography approach — Material Icons as base + custom veterinary-specific icons where Material doesn't have good matches (pet silhouettes, medical symbols specific to vet context)
- **D-09:** 3-level button emphasis hierarchy — Filled (primary action), Outlined (secondary), Text (tertiary). Clear visual priority, Material Design standard

### Animation & Motion
- **D-10:** Claude's Discretion: Animation/motion design — balance minimal functional motion (loading states, transitions, success/error feedback) for speed vs. expressive motion for delight, optimized for mid-range Android 8+ device performance

### Forms & Data Entry
- **D-11:** Step-by-step wizards for data-heavy medical workflows — break long forms into multiple steps with progress indicators. Reduces cognitive load for patient registration, EMR consultations, inventory entry. Best for low-literacy users

### Feedback & States
- **D-12:** Inline contextual error messages — errors appear next to the field/action that failed. Clear, immediate, doesn't block flow. Banner for critical system errors
- **D-13:** Illustrative empty states — custom illustrations + helpful text + primary action. Guides first-time users, reduces confusion. Friendly tone for low-literacy users
- **D-14:** Claude's Discretion: Loading state patterns — use skeleton screens for data-heavy screens (queue, EMR list) to show structure and reduce perceived wait time, use spinners for quick actions (submit, save)
- **D-15:** Toast notifications for success feedback — brief bottom popups that auto-dismiss after 2-3 seconds. Non-intrusive, doesn't block workflow. Standard for saves, updates

### Component Architecture
- **D-16:** Controlled components with explicit state management — parent controls value, onChange handlers required. More boilerplate but predictable, easier to debug, React/React Native standard
- **D-17:** Compound components for composition — flexible composition via subcomponents (e.g., `<Card><Card.Header/><Card.Body/></Card>`). Declarative, customizable. Material UI/Radix pattern
- **D-18:** Explicit variant props (type-safe) — named variants via props (e.g., `variant="filled|outlined|text"`, `size="small|medium|large"`). Type-safe with TypeScript, discoverable, self-documenting
- **D-19:** Context-based theming — React Context provides theme tokens to all components. Standard React pattern, hot-swappable themes (supports future dark mode if needed)
- **D-20:** Visual regression tests with Storybook — screenshot comparison tests via Chromatic or similar. Catches visual regressions, ensures variants render correctly. Gold standard for design systems
- **D-21:** Storybook catalog for component documentation — interactive component explorer with all variants, props, usage examples. Industry standard, doubles as visual regression test baseline
- **D-22:** Atomic design structure — Atoms (Button, Input) → Molecules (SearchBar) → Organisms (PatientCard). Clear hierarchy, scalable. Brad Frost methodology
- **D-23:** Standard React prop naming conventions — follow React/React Native naming (onChange, onPress, disabled, children). Familiar, matches ecosystem, predictable for developers
- **D-24:** Built-in accessibility by default — all components ship with ARIA labels, roles, keyboard navigation built-in. Developers can't forget. Matches WCAG 2.1 AA standard from D-06

### Mobile Navigation & Interaction
- **D-25:** Bottom tab bar as primary navigation — fixed tabs at bottom (Queue, Patients, Inventory, More). Thumb-friendly, industry standard for mobile-first apps, easy one-handed use
- **D-26:** Claude's Discretion: Gesture patterns — limit gestures to universally understood patterns (swipe to delete/archive, pull-to-refresh, tap to select). Provide visible affordances for all actions. No advanced gestures that may overwhelm low-literacy users
- **D-27:** Stack navigation for screen transitions — screens slide in/out horizontally with back button. Standard mobile pattern, clear hierarchy, easy to understand. React Navigation default
- **D-28:** 44x44pt minimum tap target size — Apple Human Interface Guidelines standard, accessible for most users, matches WCAG AA touch target requirements
- **D-29:** Hardware back button follows navigation stack — Android hardware back button navigates backward in stack, iOS swipe-from-edge does the same. Platform conventions, expected behavior
- **D-30:** Floating action buttons (FABs) for primary actions — floating "Check In Patient" button on queue, "Add Item" on inventory. Thumb-accessible, Material Design pattern, always visible

### Wireframes & Information Density
- **D-31:** Hi-fidelity prototypes for all wireframes — full-color, interactive, production-ready designs. Pixel-perfect clarity for downstream planning, reduces ambiguity during implementation
- **D-32:** Context-adaptive information density:
  - Walk-in queue: spacious (clarity, quick glance while holding animal)
  - EMR: compact (lots of medical data, experienced users)
  - Inventory: balanced (scannable lists with key info)
  - Density matches workflow cognitive needs
- **D-33:** All 4 states per screen wireframed — Empty, Loading, Populated, Error states for every screen. Complete UX coverage, no ambiguity for planners. Matches ROADMAP Phase 2 success criteria requirement
- **D-34:** Claude's Discretion: Navigation flow documentation — create annotated flow diagrams for complex workflows (queue → check-in → consultation → invoice, inventory scan → update stock) and individual screens for simpler areas (settings, reports)
- **D-35:** Progressive disclosure for content prioritization — show essential info first, hide secondary details behind taps/expand. Reduces cognitive load. EMR shows summary, tap for full SOAP notes
- **D-36:** Walk-in queue as status board with live badges — queue shown as card list with live status badges (Waiting, In Consult, Done) and position numbers. Animates when status changes. Feels like real clinic whiteboards, optimized for one-handed glance

### Claude's Discretion
- Exact elevation/shadow system values (Material Design provides standard set)
- Border radius values for cards, buttons, modals (Material Design defaults acceptable)
- Animation timing curves and durations (balance between delight and performance)
- Specific color hex values within warm & friendly palette (ensure WCAG 2.1 AA contrast)
- Icon selection for custom veterinary symbols (pet silhouettes, vet-specific medical symbols)
- Compression and retention policies for Storybook assets

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value (mobile-first for solo vets), constraints (mid-range Android 8+, low digital literacy, price sensitivity), key decisions
- `.planning/REQUIREMENTS.md` — UX-01 through UX-05 are the requirements for this phase
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria (design tokens, component library, wireframes for all modules with all states), dependency chain

### Technology Stack
- `.planning/research/STACK.md` — React Native/Expo, TypeScript, component patterns, design system integration approaches
- `.planning/research/ARCHITECTURE.md` — Mobile-first architecture, shared component patterns between mobile and web (Phase 9)

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` — Walk-in queue as home screen (D-06), clinic switching like Slack (D-23), two-layer patient data sharing model (D-25), multi-clinic support (D-22 to D-26)

### Design System References
- Material Design 3 documentation: https://m3.material.io/ — use as reference for component patterns, motion guidelines, accessibility standards
- WCAG 2.1 AA guidelines: https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_customize&levels=aa — accessibility compliance reference
- React Native Paper (Material Design 3 for React Native): https://callstack.github.io/react-native-paper/ — potential component library starting point or reference implementation

No project-specific ADRs or specs yet — Phase 2 creates the design foundation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — Phase 1 (Foundation & Authentication) establishes monorepo and auth system. Phase 2 creates the first UI components

### Established Patterns
- Monorepo structure from Phase 1 — design system will be a separate package (`@breeyo/ui` or similar) consumed by mobile app, future web dashboard
- PostgreSQL RLS multi-tenancy from Phase 1 — UI must support clinic switching (D-23 from Phase 1 context)
- Mobile-first target: mid-range Android 8+ (from Phase 1 constraints) — performance budget matters for animations, component complexity

### Integration Points
- Auth screens from Phase 1 will be restyled using the design system created in Phase 2
- Walk-in queue (Phase 3) will use the status board UX patterns (D-36) and queue wireframes from Phase 2
- All subsequent feature phases (EMR, inventory, billing, scheduling) will consume components from this phase's library

</code_context>

<specifics>
## Specific Ideas

- Walk-in queue status board should feel like the whiteboard in real vet clinics — live updating, glanceable from across the room, clear patient flow visualization
- Design system color palette should differentiate from human healthcare (avoid sterile clinical blues/whites) — veterinary care is warmer, more compassionate
- Hi-fidelity prototypes with all 4 states (empty/loading/populated/error) create unambiguous guidance for downstream planning agents — no "figure it out during implementation" gaps
- Progressive disclosure in EMR: summary view shows recent vitals + last visit notes, tap to expand full SOAP notes, prescriptions, lab results — balance information access with cognitive load for busy vets
- FAB positioning for one-handed use: bottom-right for right-handed users (majority), consider left-handed accessibility setting
- Storybook as both documentation AND visual regression test baseline — dual-purpose artifact reduces maintenance overhead

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (design system, components, wireframes). No feature suggestions or scope creep encountered.

</deferred>

---

*Phase: 02-ui-ux-design-design-system*
*Context gathered: 2026-04-17*
