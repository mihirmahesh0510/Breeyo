# Phase 02 — UI/UX Design System: Test Summary

**14 test files** covering the shared `@breeyo/ui` component library — design tokens, theme, and the atoms/molecules/organisms built on top of them.

## Why this matters (business risk being covered)

Every screen in the mobile app (and later, the web dashboard) is built from this shared
component library — a bug here doesn't affect one feature, it affects *all* of them at once.
These tests exist to catch:

- **Accessibility failures that exclude real users.** Vet clinic staff use these screens
  one-handed, in poor lighting, sometimes on older/cheaper Android devices. Touch targets
  below the 44pt WCAG minimum, or status indicators that rely on color alone (a problem for
  colorblind users), turn into daily friction or misread information — e.g. mixing up "waiting"
  and "overdue" on the queue board.
- **Design-token drift.** Colors, spacing, and typography are defined once and used
  everywhere. If someone accidentally edits a token (e.g. the primary green, or a spacing
  value), it silently reflows every screen in the app rather than failing loudly in one place
  — these tests catch that at the source.
- **Silent breakage in shared components.** Because atoms/molecules/organisms are reused across
  the queue board, patient records, billing, and notifications, an unnoticed regression in one
  component (e.g. `StatusBadge` or `NotificationBadge`) would surface as bugs in every feature
  team touches next — these tests are the guardrail that lets other phases build on this layer
  with confidence instead of re-verifying it every time.

## How these tests are run

- **Framework:** [Vitest](https://vitest.dev/), run via `pnpm --filter @breeyo/ui test`
  (configured as `vitest run` — a single pass, no watch mode).
- **Nature of these tests:** pure **unit tests** with no database, no network calls, and no
  device. They check plain JavaScript/TypeScript objects (token values, style-config maps,
  accessibility-label functions) and confirm components export as valid, callable React
  functions. There's nothing to mock here — the design system has no external dependencies to
  fake.
- **Where it actually runs:** on every push/PR via GitHub Actions (`.github/workflows/ci.yml`),
  as part of the repo-wide `pnpm test` step, alongside the API, mobile, and validators suites.
  Because these are pure logic/config tests, they run fast and don't depend on the
  Postgres/Redis services that the API tests need.

## Design tokens
`packages/ui/src/theme/__tests__/tokens.test.ts`
- Checks the raw design values are correct and complete: 28 colors, 7 typography levels (each with font size/line height/weight), 10 spacing steps in ascending order, 6 elevation levels, 6 border-radius values, and 7 animation durations.
- Spot-checks specific values (e.g. primary color, `spacing.md`, `borderRadius.lg`) so a stray edit gets caught immediately.

## Theme
`packages/ui/src/theme/__tests__/theme.test.ts`
- The custom Breeyo theme correctly extends React Native Paper's MD3 light theme (right colors, roundness, everything else from MD3 preserved).
- Custom typography, elevation, and animation values are wired into the theme object correctly.
- The `useAppTheme` hook exists and is callable.

## Accessibility
`packages/ui/src/__tests__/accessibility.test.ts`
- Buttons meet the 44pt minimum touch-target size (WCAG 2.5.5).
- Status indicators never rely on color alone — every `StatusBadge` also has a text label.
- Headings expose the correct screen-reader role; body text does not (so screen readers announce structure correctly).
- Avatars meet minimum size guidelines (40–44pt).

## Buttons, inputs & typography (atoms)
`atoms/Button`, `atoms/TextInput`, `atoms/Typography`
- Button sizes (small/medium/large) have the correct height and padding, and medium+ meet the accessible tap-target minimum.
- Button style variants (filled/outlined/text) map to the correct underlying Paper component styles, with filled+medium as the default.
- Text inputs default to the "outlined" visual style.
- All 7 typography variants (display, heading1/2, subheading, body, caption, overline) map to the correct font config and the correct accessibility role.

## Status & notification badges (atoms)
`atoms/StatusBadge`, `atoms/NotificationBadge`
- All 8 queue/billing statuses (waiting, in-consult, done, no-show, paid, unpaid, overdue, processing) have correct colors and default labels, and can be overridden.
- Notification badge count formatting: shows nothing for 0, the exact number up to 99, "99+" beyond that, and never shows negative counts — verified at each size boundary (9/10, 99/100).
- Badge accessibility text correctly pluralizes ("1 unread" vs "5 unread") and stays silent at 0.

## List rows & cards (molecules/organisms)
`molecules/ListItem`, `molecules/AccordionItem`, `molecules/EmptyState`, `organisms/Card`
- List rows enforce a minimum 56pt height.
- `Card` has 3 visual variants (elevated/filled/outlined) with correct elevation, background, and border styling, plus `Card.Header`/`Body`/`Actions` sub-components.
- Accordion items and empty-state placeholders export correctly as usable components.

## Notification list & items
`molecules/NotificationItem`, `organisms/NotificationList`
- Each of the 7 notification modules (queue, inventory, billing, WhatsApp, EMR, scheduling, system) maps to the correct icon and color.
- The notification list's filter chips are complete and in the right order, and filtering by module returns only matching notifications (including correct empty-state behavior).
- Unread-count calculation is correct for all-read, all-unread, mixed, and empty lists.

## Queue card
`organisms/QueueCard`
- Card height is fixed at 80pt.
- The accessibility label generated for a queue card is worded correctly and handles the first-position case.

---
**How to run these for real:** `pnpm --filter @breeyo/ui test` from the project root.
