# Phase 2: UI/UX Design & Design System - Research

**Researched:** 2026-04-17
**Domain:** React Native design system, component library, cross-platform tokens, mobile-first UX
**Confidence:** HIGH

## Summary

This phase establishes the visual and interaction foundation for Breeyo -- a design token system, reusable component library, Storybook catalog, and screen flow wireframes. The stack centers on React Native Paper 5.x (Material Design 3) as the component foundation, extended with `@gorhom/bottom-sheet` for BottomSheet (not included in RN Paper), `react-native-reanimated` for performant animations, and `@storybook/react-native` v10 for the component catalog. Design tokens are defined as a plain TypeScript module in `packages/ui` that both React Native Paper's theme system and the Next.js web dashboard can consume.

The architecture follows atomic design methodology (atoms/molecules/organisms) within a shared monorepo package (`packages/ui`) that Phase 1 establishes via Turborepo. All components wrap or extend React Native Paper primitives with Breeyo-specific tokens (warm clinical teal/amber palette, 7-level typography, 8px spacing grid). The component API uses controlled components with explicit variant props and compound composition patterns, all typed with TypeScript.

**Primary recommendation:** Build the design system as `packages/ui` exporting (1) a typed theme object extending `MD3LightTheme`, (2) atomic components wrapping RN Paper with Breeyo tokens baked in, and (3) code-based screen wireframes as Storybook stories with all 4 states (empty/loading/populated/error) rather than Figma files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Material Design 3 as the design system foundation
- **D-02:** Warm & friendly color palette (approachable greens/oranges/soft blues) -- veterinary care is about compassion, not clinical sterility
- **D-03:** 7-level typography scale: Display, Heading 1, Heading 2, Subheading, Body, Caption, Overline
- **D-04:** 8px base spacing scale (8, 16, 24, 32, 40, 48, 56, 64px)
- **D-05:** Light mode only for Beta
- **D-06:** WCAG 2.1 AA accessibility standards -- 4.5:1 color contrast, keyboard navigation, screen reader support
- **D-07:** Mobile-first only breakpoints (320-480px)
- **D-08:** Hybrid iconography -- Material Icons base + custom veterinary-specific icons
- **D-09:** 3-level button emphasis hierarchy -- Filled, Outlined, Text
- **D-10:** Claude's Discretion: Animation/motion design
- **D-11:** Step-by-step wizards for data-heavy medical workflows
- **D-12:** Inline contextual error messages
- **D-13:** Illustrative empty states with custom illustrations + helpful text + primary action
- **D-14:** Claude's Discretion: Loading state patterns (skeletons for lists, spinners for quick actions)
- **D-15:** Toast notifications for success feedback (auto-dismiss 2-3s)
- **D-16:** Controlled components with explicit state management
- **D-17:** Compound components for composition (e.g., `<Card><Card.Header/><Card.Body/></Card>`)
- **D-18:** Explicit variant props (type-safe)
- **D-19:** Context-based theming via React Context
- **D-20:** Visual regression tests with Storybook
- **D-21:** Storybook catalog for component documentation
- **D-22:** Atomic design structure: Atoms -> Molecules -> Organisms
- **D-23:** Standard React prop naming conventions (onChange, onPress, disabled, children)
- **D-24:** Built-in accessibility by default (ARIA labels, roles, keyboard navigation)
- **D-25:** Bottom tab bar as primary navigation (Queue, Patients, Inventory, More)
- **D-26:** Claude's Discretion: Gesture patterns (limit to universally understood patterns)
- **D-27:** Stack navigation for screen transitions
- **D-28:** 44x44pt minimum tap target size
- **D-29:** Hardware back button follows navigation stack
- **D-30:** FABs for primary actions (Check In Patient on queue, Add Item on inventory)
- **D-31:** Hi-fidelity prototypes for all wireframes
- **D-32:** Context-adaptive information density (spacious queue, compact EMR, balanced inventory)
- **D-33:** All 4 states per screen wireframed (Empty, Loading, Populated, Error)
- **D-34:** Claude's Discretion: Navigation flow documentation
- **D-35:** Progressive disclosure for content prioritization
- **D-36:** Walk-in queue as status board with live badges

### Claude's Discretion
- Exact elevation/shadow system values (Material Design provides standard set)
- Border radius values for cards, buttons, modals (Material Design defaults acceptable)
- Animation timing curves and durations (balance between delight and performance)
- Specific color hex values within warm & friendly palette (ensure WCAG 2.1 AA contrast)
- Icon selection for custom veterinary symbols
- Compression and retention policies for Storybook assets
- Loading state patterns (skeletons vs spinners per context)
- Gesture patterns (limit to universal patterns)
- Navigation flow documentation format

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Design system with color palette, typography scale, spacing tokens, elevation system | Theme token architecture extending MD3LightTheme; 7-level typography mapped to RN Paper font variants; 8px spacing scale; Material Design 3 elevation system |
| UX-02 | Reusable component library (buttons, inputs, cards, lists, modals, navigation) | Atomic design structure wrapping RN Paper 5.15.x components; @gorhom/bottom-sheet for BottomSheet; compound component patterns |
| UX-03 | Screen flow wireframes for all major modules with navigation paths and key states | Code-based wireframes as Storybook stories; 4 states per screen (empty/loading/populated/error); navigation flow diagrams |
| UX-04 | Mobile-first UX patterns for one-handed use, large tap targets, low-literacy iconography | 44x44pt minimum tap targets; bottom tab navigation; FAB positioning; Material + custom veterinary icons |
| UX-05 | Walk-in queue UX with status board, 2-tap check-in, consultation transition | Queue status board with live badges; card-based list with status indicators; FAB for check-in; progressive disclosure |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use `/src` for source code, `/tests` for tests, `/docs` for docs
- NEVER save to root folder
- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- Vitest for unit/integration testing

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-native-paper | 5.15.1 | MD3 component foundation | 337k weekly downloads; Callstack-maintained (official RN partner); 50+ MD3 components; typed theme system; Expo-compatible out of box |
| @gorhom/bottom-sheet | 5.2.9 | BottomSheet/Modal sheet | RN Paper lacks BottomSheet; gorhom is the ecosystem standard (8.9k stars); gesture-driven; Reanimated v3 powered |
| react-native-reanimated | 4.3.0 | Performant animations | UI-thread animations prevent jank on mid-range Android; required by @gorhom/bottom-sheet; bundled with Expo SDK 52+ |
| react-native-gesture-handler | 2.31.1 | Touch/gesture system | Required peer dependency for @gorhom/bottom-sheet and navigation gestures; bundled with Expo |
| react-native-safe-area-context | 5.7.0 | Safe area insets | Required by react-native-paper; handles notch/status bar across devices |
| @expo/vector-icons | 15.1.1 | Icon system (Material + MaterialCommunity) | Bundled with Expo; 7400+ MaterialCommunityIcons; zero config needed |
| @storybook/react-native | 10.3.1 | Component catalog & visual testing | Industry standard; on-device rendering; Metro config integration; Expo Router compatible |
| TypeScript | 5.5+ | Type safety | Shared types between packages; typed theme augmentation; variant prop safety |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-native-skeleton-placeholder | 5.2.4 | Skeleton loading screens | Data-heavy screens (queue list, EMR list, inventory) per D-14 |
| react-native-toast-message | 2.3.3 | Toast notifications | Success feedback per D-15; auto-dismiss; customizable styling |
| i18next | 26.0.5 | Internationalization framework | English + Hindi localization from launch; device language detection |
| react-i18next | 17.0.4 | React bindings for i18next | useTranslation hook in components; namespace support |
| expo-localization | Latest (Expo bundled) | Device locale detection | Detect user's preferred language for i18next initialization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-native-paper | Tamagui | Better perf via compiled styles; but less MD3 coverage, smaller community, steeper learning curve |
| react-native-paper | NativeBase/gluestack-ui | More design flexibility; but heavier bundle, less MD3 alignment |
| @gorhom/bottom-sheet | react-native-raw-bottom-sheet | Simpler API; but no gesture-driven snapping, no keyboard handling |
| @storybook/react-native | Ladle | Lighter; but no on-device RN rendering -- web only |
| react-native-skeleton-placeholder | react-native-auto-skeleton | Zero-config; but less control over skeleton shapes, newer/less proven |

**Installation (from packages/ui):**
```bash
# Core design system dependencies (in packages/ui)
pnpm add react-native-paper react-native-safe-area-context

# Animation + gesture (in apps/mobile -- these are Expo-bundled)
npx expo install react-native-reanimated react-native-gesture-handler

# BottomSheet (in packages/ui or apps/mobile)
pnpm add @gorhom/bottom-sheet

# Storybook (dev dependency in apps/mobile)
pnpm add -D @storybook/react-native

# Loading & toast (in packages/ui)
pnpm add react-native-skeleton-placeholder react-native-toast-message

# i18n (in packages/ui or apps/mobile)
pnpm add i18next react-i18next
npx expo install expo-localization
```

**Version verification:** All versions verified against npm registry on 2026-04-17.

## Architecture Patterns

### Recommended Project Structure
```
packages/
  ui/
    package.json
    tsconfig.json
    src/
      index.ts                    # Public API barrel export
      theme/
        tokens.ts                 # Design tokens (colors, spacing, typography, elevation)
        theme.ts                  # RN Paper theme extending MD3LightTheme
        types.ts                  # AppTheme type, useAppTheme hook
        index.ts
      atoms/
        Button/
          Button.tsx              # Wraps RN Paper Button with Breeyo variants
          Button.stories.tsx      # Storybook stories (all variants)
          Button.test.tsx         # Unit tests
          index.ts
        TextInput/
        Icon/
        Badge/
        StatusBadge/
        Typography/               # Text components for each of 7 levels
        Divider/
        ActivityIndicator/
      molecules/
        SearchBar/
        ListItem/                 # Wraps RN Paper List.Item with Breeyo styling
        FormField/                # Label + Input + Error message composite
        EmptyState/               # Illustration + text + action button (D-13)
        SkeletonLoader/           # Skeleton placeholder patterns for common layouts
        Toast/                    # Toast notification wrapper
      organisms/
        Card/                     # Compound component: Card, Card.Header, Card.Body, Card.Actions
        Modal/                    # Wraps RN Paper Modal/Portal
        BottomSheet/              # Wraps @gorhom/bottom-sheet with theme
        NavigationBar/            # Bottom tab bar configuration
        AppBar/                   # Top app bar with clinic switcher
        PatientCard/              # Pet info + status badge + owner info
        QueueCard/                # Queue entry with status, position, actions
        WizardStepper/            # Multi-step form wrapper (D-11)
      wireframes/                 # Screen-level compositions (Storybook only)
        auth/
        queue/
        emr/
        inventory/
        billing/
        scheduling/
        whatsapp/
        dashboard/
      i18n/
        config.ts                 # i18next initialization
        locales/
          en/
            common.json
            queue.json
            emr.json
          hi/
            common.json
            queue.json
            emr.json
```

### Pattern 1: Typed Theme Extension
**What:** Extend React Native Paper's MD3LightTheme with Breeyo-specific tokens while maintaining full TypeScript safety.
**When to use:** Every component that needs theme values.
**Example:**
```typescript
// Source: React Native Paper theming docs
// packages/ui/src/theme/tokens.ts
export const colors = {
  // Primary: Teal (warm clinical, not sterile blue)
  primary: '#00897B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#A7F3EC',
  onPrimaryContainer: '#002019',

  // Secondary: Amber (warm accent)
  secondary: '#FFB300',
  onSecondary: '#3F2E00',
  secondaryContainer: '#FFE08A',
  onSecondaryContainer: '#231B00',

  // Tertiary: Soft blue (supporting)
  tertiary: '#5C6BC0',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#DEE0FF',
  onTertiaryContainer: '#151A5C',

  // Semantic
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  success: '#2E7D32',
  successContainer: '#C8E6C9',
  warning: '#F57F17',
  warningContainer: '#FFF9C4',

  // Surfaces
  background: '#FAFDF9',
  surface: '#FAFDF9',
  surfaceVariant: '#DBE5E1',
  outline: '#6F7975',
  outlineVariant: '#BFC9C4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
  '4xl': 56,
  '5xl': 64,
} as const;

export const typography = {
  display: { fontSize: 36, lineHeight: 44, fontWeight: '400' as const },
  heading1: { fontSize: 28, lineHeight: 36, fontWeight: '500' as const },
  heading2: { fontSize: 22, lineHeight: 28, fontWeight: '500' as const },
  subheading: { fontSize: 18, lineHeight: 24, fontWeight: '500' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  overline: { fontSize: 10, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 1.5 },
} as const;

export const elevation = {
  level0: 0,
  level1: 1,  // Cards, surfaces
  level2: 3,  // FABs, bottom sheets
  level3: 6,  // Modals, dialogs
  level4: 8,  // Sticky headers
  level5: 12, // Navigation drawers
} as const;

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
```

```typescript
// packages/ui/src/theme/theme.ts
import { MD3LightTheme } from 'react-native-paper';
import { colors, spacing, typography, elevation, borderRadius } from './tokens';

export const breeyoTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
  // Custom extensions beyond MD3
  spacing,
  typography: {
    ...MD3LightTheme.fonts,
    // Map 7-level scale onto MD3 font variants
    displayLarge: { ...MD3LightTheme.fonts.displayLarge, ...typography.display },
    headlineLarge: { ...MD3LightTheme.fonts.headlineLarge, ...typography.heading1 },
    headlineMedium: { ...MD3LightTheme.fonts.headlineMedium, ...typography.heading2 },
    titleLarge: { ...MD3LightTheme.fonts.titleLarge, ...typography.subheading },
    bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, ...typography.body },
    labelSmall: { ...MD3LightTheme.fonts.labelSmall, ...typography.caption },
    labelLarge: { ...MD3LightTheme.fonts.labelLarge, ...typography.overline },
  },
  elevation,
  borderRadius,
  customTypography: typography,
} as const;

export type AppTheme = typeof breeyoTheme;
```

```typescript
// packages/ui/src/theme/types.ts
import { useTheme } from 'react-native-paper';
import type { AppTheme } from './theme';

export const useAppTheme = () => useTheme<AppTheme>();
```

### Pattern 2: Compound Component with Variants
**What:** Components use compound pattern for flexible composition with typed variant props.
**When to use:** Complex components like Card, Modal, WizardStepper.
**Example:**
```typescript
// packages/ui/src/organisms/Card/Card.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import { useAppTheme } from '../../theme';

type CardVariant = 'elevated' | 'filled' | 'outlined';

interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

interface CardHeaderProps {
  children: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
}

interface CardActionsProps {
  children: React.ReactNode;
}

function CardHeader({ children }: CardHeaderProps) {
  const theme = useAppTheme();
  return (
    <View style={{ padding: theme.spacing.md }}>
      {children}
    </View>
  );
}

function CardBody({ children }: CardBodyProps) {
  const theme = useAppTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.md }}>
      {children}
    </View>
  );
}

function CardActions({ children }: CardActionsProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.actions, { padding: theme.spacing.sm }]}>
      {children}
    </View>
  );
}

function Card({ variant = 'elevated', children, onPress, testID }: CardProps) {
  const theme = useAppTheme();
  return (
    <Surface
      style={[styles.card, { borderRadius: theme.borderRadius.lg }]}
      elevation={variant === 'elevated' ? theme.elevation.level1 : theme.elevation.level0}
      testID={testID}
    >
      {children}
    </Surface>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Actions = CardActions;

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});

export { Card };
export type { CardProps, CardVariant };
```

### Pattern 3: Accessible Component with Built-in A11y
**What:** Every component ships with accessibility props set by default.
**When to use:** Every interactive component.
**Example:**
```typescript
// packages/ui/src/atoms/Button/Button.tsx
import React from 'react';
import { Button as PaperButton } from 'react-native-paper';
import { useAppTheme } from '../../theme';

type ButtonVariant = 'filled' | 'outlined' | 'text';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  testID?: string;
}

const SIZE_MAP = {
  small: { minHeight: 36, paddingHorizontal: 12 },
  medium: { minHeight: 44, paddingHorizontal: 16 },  // Meets 44pt minimum
  large: { minHeight: 52, paddingHorizontal: 24 },
} as const;

const VARIANT_MAP: Record<ButtonVariant, 'contained' | 'outlined' | 'text'> = {
  filled: 'contained',
  outlined: 'outlined',
  text: 'text',
};

export function Button({
  variant = 'filled',
  size = 'medium',
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  testID,
}: ButtonProps) {
  const theme = useAppTheme();
  const sizeStyle = SIZE_MAP[size];

  return (
    <PaperButton
      mode={VARIANT_MAP[variant]}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      icon={icon}
      style={{ minHeight: sizeStyle.minHeight }}
      contentStyle={{ paddingHorizontal: sizeStyle.paddingHorizontal, minHeight: sizeStyle.minHeight }}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      testID={testID}
    >
      {label}
    </PaperButton>
  );
}
```

### Pattern 4: Storybook Story with All 4 States
**What:** Every wireframe screen renders all 4 states as separate stories.
**When to use:** All screen-level wireframe components (D-33).
**Example:**
```typescript
// packages/ui/src/wireframes/queue/QueueStatusBoard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-native';
import { QueueStatusBoard } from './QueueStatusBoard';
import { mockQueueData, mockEmptyQueue } from './fixtures';

const meta: Meta<typeof QueueStatusBoard> = {
  title: 'Wireframes/Queue/StatusBoard',
  component: QueueStatusBoard,
  parameters: {
    notes: 'Walk-in queue status board (D-36). Spacious layout for quick glance.',
  },
};

export default meta;
type Story = StoryObj<typeof QueueStatusBoard>;

export const Empty: Story = {
  args: { entries: [], isLoading: false, error: null },
  parameters: { notes: 'Empty state: illustration + "No patients in queue" + Check In button' },
};

export const Loading: Story = {
  args: { entries: [], isLoading: true, error: null },
  parameters: { notes: 'Skeleton cards mimicking queue card layout' },
};

export const Populated: Story = {
  args: { entries: mockQueueData, isLoading: false, error: null },
  parameters: { notes: '5 entries with mixed statuses: Waiting (3), In Consult (1), Done (1)' },
};

export const Error: Story = {
  args: { entries: [], isLoading: false, error: 'Failed to load queue. Pull to refresh.' },
  parameters: { notes: 'Error banner with retry action' },
};
```

### Pattern 5: Cross-Platform Token Consumption
**What:** Same token file consumed by React Native (via theme context) and Next.js web (via CSS variables or direct import).
**When to use:** Phase 9 when web dashboard is built; tokens designed for this from Phase 2.
**Example:**
```typescript
// packages/ui/src/theme/tokens.ts is imported by both platforms
// React Native: consumed via PaperProvider theme
// Web (Phase 9): consumed via CSS custom properties generator

// packages/ui/src/theme/web-tokens.ts (created in Phase 9, designed for now)
import { colors, spacing, typography } from './tokens';

export function generateCSSVariables(): string {
  return `
    :root {
      --color-primary: ${colors.primary};
      --color-secondary: ${colors.secondary};
      --spacing-sm: ${spacing.sm}px;
      --spacing-md: ${spacing.md}px;
      --spacing-lg: ${spacing.lg}px;
      /* ... */
    }
  `;
}
```

### Anti-Patterns to Avoid
- **Styling directly in components instead of using theme tokens:** All colors, spacing, and typography must come from the theme. Hardcoded values will break consistency and make future dark mode impossible.
- **Building BottomSheet from scratch:** RN Paper does not include a BottomSheet. Use @gorhom/bottom-sheet -- the gesture handling, keyboard avoidance, and snap point math are deceptively complex.
- **Putting platform-specific code in packages/ui:** The ui package must be platform-agnostic. Platform-specific imports (like `react-native-reanimated`) should be peer dependencies, not direct dependencies.
- **Forgetting `accessibilityLabel` on interactive elements:** Every touchable must have it. Build it into the component API so consumers cannot forget.
- **Using `Animated` API from React Native core:** Always use `react-native-reanimated` for animations. Core `Animated` runs on the JS thread and drops frames on mid-range Android.
- **Skipping the PaperProvider wrapper:** Components will render with default MD3 theme colors instead of Breeyo tokens if the provider is missing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom sheet with gestures | Custom draggable view with PanResponder | `@gorhom/bottom-sheet` v5 | Snap points, keyboard handling, gesture interaction, scroll locking, modal presentation -- hundreds of edge cases |
| Skeleton loading screens | Custom animated placeholder boxes | `react-native-skeleton-placeholder` | Shimmer animation, FlexBox layout mirroring, consistent timing across screens |
| Toast notifications | Custom positioned overlay with timers | `react-native-toast-message` | Queue management, auto-dismiss, gesture dismiss, multiple toast types, accessibility announcements |
| Material Design 3 color scheme | Manual color picking with contrast checking | RN Paper's MD3 color generation tool or `@material/material-color-utilities` | MD3 tonal palettes require precise math for AA contrast; manual picking will fail WCAG checks |
| Icon system | Custom SVG management | `@expo/vector-icons` (MaterialCommunityIcons) | 7400+ icons bundled, consistent sizing, tree-shakeable with Expo's asset system |
| Internationalization | Manual string lookup object | `i18next` + `react-i18next` | Pluralization rules, interpolation, namespace loading, language detection, missing key fallbacks |
| Responsive tap targets | Manual hitSlop calculations on each touchable | Built into component API (44pt minimums in Button/ListItem/etc.) | Centralized enforcement; consumers never think about it |
| Form validation display | Custom error state management per field | `FormField` molecule that composes label + input + error from Zod validation | Consistent error styling, animation, and accessibility across all forms |

**Key insight:** React Native Paper provides ~50 MD3 components but lacks BottomSheet, skeleton loaders, and toast. These three gaps are the only ones that need filling from external libraries. Everything else should wrap or extend RN Paper.

## Common Pitfalls

### Pitfall 1: Theme Augmentation TypeScript Errors
**What goes wrong:** Adding custom properties (spacing, borderRadius, customTypography) to the RN Paper theme causes TypeScript to not recognize them in `useTheme()`.
**Why it happens:** RN Paper's `useTheme` returns the default `MD3Theme` type. Custom extensions need explicit type augmentation.
**How to avoid:** Create a typed `useAppTheme` hook that casts to your `AppTheme` type (see Pattern 1 above). Export ONLY `useAppTheme` from `packages/ui` -- never let consumers use raw `useTheme`.
**Warning signs:** TypeScript errors when accessing `theme.spacing.md` or `theme.borderRadius.lg`.

### Pitfall 2: Storybook Metro Config Conflict with Expo Router
**What goes wrong:** Storybook v10 uses a Metro config wrapper (`withStorybook`) that can conflict with Expo Router's own Metro requirements.
**Why it happens:** Both systems want to modify Metro's resolver and transformer. Order of wrapping matters.
**How to avoid:** Apply `withStorybook` as the outermost wrapper in metro.config.js. Use the `enabled` flag to conditionally include Storybook (disable for production builds). For Expo Router integration, create a dedicated `/storybook` route rather than replacing the entire app.
**Warning signs:** Build errors about duplicate modules or "unable to resolve" errors in story files.

### Pitfall 3: Reanimated Performance on Android 8
**What goes wrong:** Complex animations (layout animations, shared element transitions) cause frame drops on older Android devices.
**Why it happens:** Android 8 devices have limited GPU/CPU. Reanimated runs on UI thread but the rendering pipeline is slower.
**How to avoid:** Per D-10 (Claude's discretion on animation): use minimal functional motion only. Limit to: (1) loading shimmer, (2) status badge color transitions, (3) screen slide transitions, (4) toast entrance/exit. No spring physics, no complex layout animations. Test on a physical mid-range Android device.
**Warning signs:** `FrameDropRate` warnings in Flipper/React DevTools; animations feel "janky" on anything below Snapdragon 600-series.

### Pitfall 4: RN Paper Modal Loses Theme Context
**What goes wrong:** Components rendered inside React Native Paper's `Modal` or `Portal` don't receive the custom theme.
**Why it happens:** Portal renders content outside the normal component tree. If PaperProvider wraps below the Portal host, theme context is lost.
**How to avoid:** Ensure `PaperProvider` wraps the entire app at the root level (above NavigationContainer, above everything). RN Paper's own `Modal` component handles this correctly, but custom Portal usage needs care.
**Warning signs:** Modal content renders with default MD3 colors (purple primary) instead of Breeyo teal.

### Pitfall 5: Bottom Tab Bar Occluding Content
**What goes wrong:** Content at the bottom of scrollable screens is hidden behind the fixed bottom tab bar.
**Why it happens:** The tab bar sits on top of the screen content. Without proper insets, the last items are unreachable.
**How to avoid:** Use `react-native-safe-area-context`'s `useSafeAreaInsets()` to add bottom padding equal to the tab bar height. Apply this as a default in scroll container components.
**Warning signs:** Users cannot see or tap the last item in a list view.

### Pitfall 6: Hindi Text Rendering Issues
**What goes wrong:** Hindi (Devanagari) text clips vertically or has incorrect line height.
**Why it happens:** Devanagari script has taller ascenders and descenders than Latin script. Default line heights are insufficient.
**How to avoid:** Set lineHeight to at least 1.5x fontSize for body text in Hindi. Test all 7 typography levels with Hindi text. Note: Hindi is LTR (not RTL) so no RTL layout changes are needed.
**Warning signs:** Characters clipped at top/bottom; matras (vowel marks) cut off.

### Pitfall 7: Storybook Dependency Version Mismatch
**What goes wrong:** Storybook addons at different major versions cause runtime errors or missing features.
**Why it happens:** @storybook/react-native v10 requires all addons at v10.x. Mixing v8/v9 addons with v10 core breaks.
**How to avoid:** Pin ALL @storybook/* packages to the same major version (10.x). Run `npx storybook@latest doctor` to detect mismatches.
**Warning signs:** "Cannot find module" errors; addon panels not rendering.

### Pitfall 8: Expo SDK 52 + New Architecture Animation Regressions
**What goes wrong:** Animations that worked fine before show performance regressions after enabling New Architecture.
**Why it happens:** Fabric renderer has different timing characteristics than the old renderer. Some Reanimated patterns need adjustment.
**How to avoid:** Test animations on physical Android device with New Architecture enabled. Prefer `useAnimatedStyle` over `LayoutAnimation.configureNext()` (known broken in SDK 52). Use `withTiming` with short durations (150-250ms) rather than `withSpring` for most transitions.
**Warning signs:** `LayoutAnimation.configureNext() broken in SDK 52` is a known Expo issue.

## Code Examples

### StatusBadge Atom (Queue Status Indicator)
```typescript
// packages/ui/src/atoms/StatusBadge/StatusBadge.tsx
import React from 'react';
import { Badge } from 'react-native-paper';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme';
import { Typography } from '../Typography';

type QueueStatus = 'waiting' | 'in-consult' | 'done' | 'no-show';

interface StatusBadgeProps {
  status: QueueStatus;
  testID?: string;
}

const STATUS_CONFIG: Record<QueueStatus, { label: string; colorKey: string }> = {
  waiting: { label: 'Waiting', colorKey: 'secondaryContainer' },
  'in-consult': { label: 'In Consult', colorKey: 'primaryContainer' },
  done: { label: 'Done', colorKey: 'successContainer' },
  'no-show': { label: 'No Show', colorKey: 'errorContainer' },
};

export function StatusBadge({ status, testID }: StatusBadgeProps) {
  const theme = useAppTheme();
  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors[config.colorKey as keyof typeof theme.colors],
          borderRadius: theme.borderRadius.full,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        },
      ]}
      accessibilityLabel={`Status: ${config.label}`}
      accessibilityRole="text"
      testID={testID}
    >
      <Typography variant="caption" style={styles.label}>
        {config.label}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'flex-start' },
  label: { textTransform: 'uppercase' },
});
```

### i18n Configuration
```typescript
// packages/ui/src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en_common from './locales/en/common.json';
import hi_common from './locales/hi/common.json';

const resources = {
  en: { common: en_common },
  hi: { common: hi_common },
};

i18n.use(initReactI18next).init({
  resources,
  lng: Localization.getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
```

### WizardStepper Organism (D-11: Step-by-step forms)
```typescript
// packages/ui/src/organisms/WizardStepper/WizardStepper.tsx (simplified)
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { useAppTheme } from '../../theme';
import { Button } from '../../atoms/Button';
import { Typography } from '../../atoms/Typography';

interface WizardStepperProps {
  steps: { title: string; content: React.ReactNode }[];
  onComplete: () => void;
  onSkip?: () => void;
}

export function WizardStepper({ steps, onComplete, onSkip }: WizardStepperProps) {
  const [current, setCurrent] = useState(0);
  const theme = useAppTheme();
  const progress = (current + 1) / steps.length;

  return (
    <View style={styles.container}>
      <ProgressBar progress={progress} color={theme.colors.primary} />
      <Typography variant="caption" style={{ padding: theme.spacing.sm }}>
        Step {current + 1} of {steps.length}: {steps[current].title}
      </Typography>
      <View style={{ flex: 1, padding: theme.spacing.md }}>
        {steps[current].content}
      </View>
      <View style={[styles.actions, { padding: theme.spacing.md }]}>
        {onSkip && (
          <Button variant="text" label="Skip for now" onPress={onSkip} />
        )}
        {current > 0 && (
          <Button variant="outlined" label="Back" onPress={() => setCurrent(c => c - 1)} />
        )}
        <Button
          variant="filled"
          label={current === steps.length - 1 ? 'Done' : 'Next'}
          onPress={() => {
            if (current === steps.length - 1) onComplete();
            else setCurrent(c => c + 1);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
```

### EmptyState Molecule (D-13)
```typescript
// packages/ui/src/molecules/EmptyState/EmptyState.tsx
import React from 'react';
import { View, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { useAppTheme } from '../../theme';
import { Typography } from '../../atoms/Typography';
import { Button } from '../../atoms/Button';

interface EmptyStateProps {
  illustration: ImageSourcePropType;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  testID?: string;
}

export function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing.xl }]} testID={testID}>
      <Image source={illustration} style={styles.illustration} accessibilityIgnoresInvertColors />
      <Typography variant="heading2" style={{ marginTop: theme.spacing.lg, textAlign: 'center' }}>
        {title}
      </Typography>
      <Typography variant="body" style={{ marginTop: theme.spacing.sm, textAlign: 'center', color: theme.colors.outline }}>
        {description}
      </Typography>
      <Button
        variant="filled"
        label={actionLabel}
        onPress={onAction}
        size="large"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  illustration: { width: 200, height: 200, resizeMode: 'contain' },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-native-paper 4.x (MD2) | react-native-paper 5.x (MD3) | 2023 | Full Material Design 3 / Material You support; dynamic color generation; new component API |
| @storybook/react-native v7 | @storybook/react-native v10 | 2025-2026 | On-device Metro integration; Expo Router support; MCP endpoint for AI tooling |
| Animated API (RN Core) | react-native-reanimated v4 | 2024-2025 | UI thread animations; worklet-based; essential for mid-range Android perf |
| react-native-vector-icons (monolith) | @expo/vector-icons + per-icon-set packages | 2025 | 90% bundle size reduction via tree-shaking; Expo-native integration |
| Figma-first wireframes | Code-based wireframes in Storybook | 2024-2026 | Wireframes are runnable components; visual regression tests; no design-to-code gap |
| Old Architecture (Bridge) | New Architecture (Fabric/TurboModules) | Expo SDK 52 (2025) | Better animation perf; concurrent rendering; but some layout animation regressions |

**Deprecated/outdated:**
- `react-native-paper` v4.x (MD2 only) -- migrate to v5.x
- `@storybook/react-native` v7/v8 -- v10 is current; major API changes
- `LayoutAnimation.configureNext()` -- broken in Expo SDK 52+; use Reanimated instead
- `react-native-vector-icons` monolith install -- use per-icon-set packages or `@expo/vector-icons`

## Open Questions

1. **Custom Veterinary Icons (D-08)**
   - What we know: Material + MaterialCommunity icons cover general UI. Vet-specific icons (pet silhouettes, species-specific, vet medical symbols) are not in standard sets.
   - What's unclear: How many custom icons are needed; what exact symbols; SVG vs. custom icon font.
   - Recommendation: Start with MaterialCommunityIcons (has some animal icons: `dog`, `cat`, `paw`, `needle`, `stethoscope`). Identify gaps during wireframing. Commission custom SVGs only for icons that truly have no standard equivalent. Use `@expo/vector-icons` createIconSet for custom fonts if more than 10 custom icons needed.

2. **Empty State Illustrations (D-13)**
   - What we know: Empty states need custom illustrations with friendly tone.
   - What's unclear: Whether to use a library (like undraw.co) or commission custom illustrations. Who creates them.
   - Recommendation: Use placeholder illustrations from an open-source illustration library (unDraw, OpenPeeps) for Beta. Replace with custom brand illustrations post-Beta if needed. The component architecture (EmptyState molecule) is illustration-agnostic.

3. **Visual Regression Testing CI Pipeline (D-20)**
   - What we know: Chromatic is the standard for Storybook visual regression; free tier exists.
   - What's unclear: Whether Chromatic supports @storybook/react-native on-device stories, or only web-rendered stories via react-native-web.
   - Recommendation: Use `@storybook/addon-react-native-web` to render RN components in a web Storybook for Chromatic integration. On-device Storybook for development; web Storybook for CI visual regression. This dual approach is the current ecosystem standard.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build tooling, Metro bundler | Yes | v24.13.1 | -- |
| npm/pnpm | Package management | Yes | npm 11.8.0 | -- |
| npx | CLI tool execution | Yes | 11.8.0 | -- |
| Expo CLI | Mobile app development | Not verified (Phase 1 installs) | -- | `npx expo` (no global install needed) |
| Android Emulator/Device | Testing animations, tap targets | Not verified | -- | Physical device via Expo Go |
| Chromatic | Visual regression CI | Cloud service (signup needed) | -- | Manual visual review in Storybook |

**Missing dependencies with no fallback:**
- None -- all critical tools available or installable via npm.

**Missing dependencies with fallback:**
- Expo CLI: `npx expo` works without global install.
- Android testing: Expo Go on physical device sufficient for Beta.
- Chromatic: Manual Storybook review acceptable for Beta; Chromatic adds automation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (from Phase 1 infrastructure) |
| Config file | `packages/ui/vitest.config.ts` (Wave 0 -- needs creation) |
| Quick run command | `pnpm --filter @breeyo/ui test` |
| Full suite command | `pnpm turbo test --filter=@breeyo/ui` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Token file exports complete palette, 7 typography levels, spacing scale, elevation, border radii | unit | `pnpm --filter @breeyo/ui test -- tokens.test.ts` | Wave 0 |
| UX-01 | Theme extends MD3LightTheme with all custom tokens accessible via useAppTheme | unit | `pnpm --filter @breeyo/ui test -- theme.test.ts` | Wave 0 |
| UX-02 | Button renders all 3 variants (filled/outlined/text) x 3 sizes with correct styles | unit | `pnpm --filter @breeyo/ui test -- Button.test.ts` | Wave 0 |
| UX-02 | Card compound component renders Header/Body/Actions sub-components | unit | `pnpm --filter @breeyo/ui test -- Card.test.ts` | Wave 0 |
| UX-02 | All 8+ components render without errors | unit | `pnpm --filter @breeyo/ui test` | Wave 0 |
| UX-03 | Storybook stories render for all major module wireframes | manual | Launch Storybook, verify each wireframe renders 4 states | N/A |
| UX-04 | Button minimum height is 44pt; tap target meets accessibility requirement | unit | `pnpm --filter @breeyo/ui test -- Button.test.ts` | Wave 0 |
| UX-04 | All interactive components have accessibilityLabel and accessibilityRole | unit | `pnpm --filter @breeyo/ui test -- accessibility.test.ts` | Wave 0 |
| UX-05 | StatusBadge renders all 4 queue statuses with correct colors | unit | `pnpm --filter @breeyo/ui test -- StatusBadge.test.ts` | Wave 0 |
| UX-05 | QueueCard displays position, patient name, status badge, and time | unit | `pnpm --filter @breeyo/ui test -- QueueCard.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @breeyo/ui test`
- **Per wave merge:** `pnpm turbo test --filter=@breeyo/ui`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/vitest.config.ts` -- Vitest configuration for UI package
- [ ] `packages/ui/tests/setup.ts` -- Test setup with RN Paper provider wrapper
- [ ] `packages/ui/src/theme/__tests__/tokens.test.ts` -- Token completeness tests
- [ ] `packages/ui/src/theme/__tests__/theme.test.ts` -- Theme integration tests
- [ ] Framework install: `pnpm add -D vitest @testing-library/react-native` in packages/ui

## Sources

### Primary (HIGH confidence)
- [React Native Paper theming docs](http://oss.callstack.com/react-native-paper/docs/guides/theming/) -- Theme structure, TypeScript augmentation, useTheme hook, provider setup
- [React Native Paper getting started](http://oss.callstack.com/react-native-paper/docs/guides/getting-started/) -- Installation, peer deps, Babel config
- [@gorhom/bottom-sheet docs](https://gorhom.dev/react-native-bottom-sheet/) -- v5 API, peer dependencies, Expo setup
- [@storybook/react-native GitHub](https://github.com/storybookjs/react-native) -- v10 setup, Metro config, Expo Router integration
- [React Native accessibility docs](https://reactnative.dev/docs/accessibility) -- accessibilityLabel, accessibilityRole, accessibilityState
- [Expo Vector Icons docs](https://docs.expo.dev/guides/icons/) -- Icon families, usage with Expo
- npm registry (2026-04-17) -- All package versions verified

### Secondary (MEDIUM confidence)
- [Atomic Design in React/React Native (DEV Community)](https://dev.to/serifcolakel/atomic-design-in-react-and-react-native-building-scalable-ui-systems-30o4) -- Atomic design folder structure, testing strategy
- [Storybook visual testing with Chromatic](https://www.chromatic.com/storybook) -- Visual regression workflow
- [React Reanimated performance guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) -- Animation budgets for low-end Android
- [Expo SDK 52 release notes](https://creators.spotify.com/pod/profile/react-native-talk/episodes/This-is-big--Expo-SDK-52-beta-is-now-available-e2q3p3e) -- New Architecture, Reanimated integration
- [Turborepo design system template](https://vercel.com/templates/react/turborepo-design-system) -- Monorepo package structure

### Tertiary (LOW confidence)
- Veterinary queue UX patterns from NextMe, WaitWhile, ER Express -- general queue management patterns, not vet-specific UI libraries
- Hindi text rendering characteristics -- based on general Devanagari rendering knowledge; needs physical device validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm, well-established ecosystem choices, RN Paper is the canonical MD3 library for React Native
- Architecture: HIGH -- atomic design + compound components is the standard pattern for RN design systems; monorepo structure matches Phase 1 plan
- Token system: HIGH -- RN Paper's theming API is well-documented; TypeScript augmentation pattern is officially documented
- Pitfalls: MEDIUM -- based on known issues from GitHub, official docs, and ecosystem experience; animation regressions on Android 8 need physical device validation
- Wireframe approach: MEDIUM -- code-based wireframes in Storybook is the modern approach but requires discipline; alternative is Figma which the team may prefer
- i18n/Hindi rendering: MEDIUM -- i18next is well-proven; Hindi-specific rendering needs physical device testing

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days -- stable ecosystem, no major releases expected)
