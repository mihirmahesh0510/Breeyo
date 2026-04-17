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
   - Recommendation: Use `@storybook/react-native-web-vite` (the current replacement for `@storybook/addon-react-native-web`) to render RN components in a web Storybook for Chromatic integration. On-device Storybook for development; web Storybook for CI visual regression. This dual approach is the current ecosystem standard. See Deep Dive: Storybook + Expo Integration for details.

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

---

# Deep Dive Research (2026-04-17)

The following four sections provide detailed technical research on areas identified during initial research review.

---

## Deep Dive: Storybook + Expo Integration

**Confidence:** HIGH -- sourced from official Storybook GitHub, official Expo Router docs, and Callstack blog posts.

### Overview

`@storybook/react-native` v10.3.1 is the current stable release. It integrates with Metro bundler via the `withStorybook` config wrapper and supports Expo Router-based projects natively. The key architectural decision is whether to run Storybook as the entire app (replacing the entry point) or as a dedicated route within Expo Router. For Breeyo, the **dedicated route approach** is recommended -- it allows developers to access Storybook at `/storybook` without disrupting normal app development.

### Step-by-Step Setup

#### 1. Install Dependencies

All `@storybook/*` packages must be pinned to the same major version (10.x). Verified versions as of 2026-04-17:

```bash
# In apps/mobile (dev dependencies)
pnpm add -D @storybook/react-native@10.3.1 \
  @storybook/addon-ondevice-controls@10.3.1 \
  @storybook/addon-ondevice-actions@10.3.1 \
  @storybook/addon-ondevice-notes@10.3.1

# For web-based visual regression (in apps/mobile or separate web-storybook project)
pnpm add -D @storybook/react-native-web-vite@10.3.5
```

#### 2. Create the `.rnstorybook` Configuration Directory

```
apps/mobile/
  .rnstorybook/
    main.ts           # Story discovery config
    preview.tsx        # Global decorators (PaperProvider wrapper)
    index.tsx          # Storybook entry point
```

**main.ts:**
```typescript
// apps/mobile/.rnstorybook/main.ts
import type { StorybookConfig } from '@storybook/react-native';

const main: StorybookConfig = {
  stories: [
    '../../../packages/ui/src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-ondevice-controls',
    '@storybook/addon-ondevice-actions',
    '@storybook/addon-ondevice-notes',
  ],
};

export default main;
```

**preview.tsx:**
```typescript
// apps/mobile/.rnstorybook/preview.tsx
import React from 'react';
import type { Preview } from '@storybook/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { breeyoTheme } from '@breeyo/ui';

const preview: Preview = {
  decorators: [
    (Story) => (
      <SafeAreaProvider>
        <PaperProvider theme={breeyoTheme}>
          <Story />
        </PaperProvider>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;
```

**index.tsx:**
```typescript
// apps/mobile/.rnstorybook/index.tsx
import view from './storybook.requires';

export default view;
```

Note: `storybook.requires.ts` is auto-generated by the Metro config wrapper. Do not create it manually.

#### 3. Metro Config with `withStorybook`

The `withStorybook` wrapper modifies Metro to:
- Enable `unstable_allowRequireContext` (required for dynamic story imports)
- Generate `storybook.requires.ts` from story glob patterns
- Optionally enable/disable Storybook via the `enabled` flag

```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

const config = getDefaultConfig(__dirname);

module.exports = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
  configPath: './.rnstorybook',
});
```

**Critical ordering rule:** `withStorybook` must be the **outermost** wrapper. If you have other Metro config transforms (e.g., for SVG, aliases), apply them to `config` before passing to `withStorybook`.

#### 4. Expo Router Integration (Dedicated Route)

Create a `/storybook` route within the app's file-based routing:

```typescript
// apps/mobile/app/storybook.tsx
import { Redirect } from 'expo-router';

// Gate access: only render Storybook when env var is set
const isEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

export default function StorybookScreen() {
  if (!isEnabled) {
    return <Redirect href="/" />;
  }

  // Dynamic import to avoid bundling Storybook in production
  const StorybookUI = require('../.rnstorybook').default;
  return <StorybookUI />;
}
```

**Disable the header for the Storybook route** in your layout:

```typescript
// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="storybook" options={{ headerShown: false }} />
    </Stack>
  );
}
```

#### 5. Package.json Scripts

```json
{
  "scripts": {
    "start": "expo start",
    "storybook": "EXPO_PUBLIC_STORYBOOK_ENABLED=true expo start",
    "storybook:web": "storybook dev -p 6006"
  }
}
```

### On-Device vs. Web Storybook (Dual Approach)

| Aspect | On-Device (@storybook/react-native) | Web (@storybook/react-native-web-vite) |
|--------|--------------------------------------|----------------------------------------|
| Rendering | Native RN components on phone/emulator | react-native-web in browser |
| Use case | Development, pixel-perfect testing | Visual regression CI (Chromatic), documentation |
| Performance | Accurate to real device | Faster iteration, but web rendering differs |
| Setup | Metro config wrapper | Separate .storybook/main.ts with Vite |
| Version | 10.3.1 | 10.3.5 |

**Recommendation for Breeyo:** Use on-device Storybook for development and manual testing. Set up `@storybook/react-native-web-vite` for Chromatic visual regression when CI pipeline is ready (can defer to post-Beta).

### Web Storybook Config for Chromatic

```typescript
// apps/mobile/.storybook/main.ts (web storybook -- separate from .rnstorybook)
import type { StorybookConfig } from '@storybook/react-native-web-vite';

const config: StorybookConfig = {
  stories: ['../../../packages/ui/src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      pluginReactOptions: {
        babel: {
          plugins: ['react-native-reanimated/plugin'],
        },
      },
    },
  },
};

export default config;
```

**Peer dependencies for web Storybook:** React Native >= 0.72, react-native-web >= 0.19, Vite >= 5.

### CSF3 Story Patterns for RN Paper Components

```typescript
// packages/ui/src/atoms/Button/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-native';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['filled', 'outlined', 'text'],
    },
    size: {
      control: { type: 'select' },
      options: ['small', 'medium', 'large'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Filled: Story = {
  args: {
    variant: 'filled',
    label: 'Check In Patient',
    onPress: () => {},
  },
};

export const Outlined: Story = {
  args: {
    variant: 'outlined',
    label: 'Cancel',
    onPress: () => {},
  },
};

export const Text: Story = {
  args: {
    variant: 'text',
    label: 'Skip for now',
    onPress: () => {},
  },
};

export const Loading: Story = {
  args: {
    variant: 'filled',
    label: 'Saving...',
    loading: true,
    onPress: () => {},
  },
};

export const WithIcon: Story = {
  args: {
    variant: 'filled',
    label: 'Add Patient',
    icon: 'plus',
    onPress: () => {},
  },
};
```

### Common Integration Failures and Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| "Unable to resolve module" for story files | `withStorybook` not generating `storybook.requires.ts` | Ensure `enabled: true` in Metro config; delete Metro cache (`npx expo start --clear`) |
| Stories render but no controls panel | Missing `@storybook/addon-ondevice-controls` | Install addon at same major version (10.x) |
| Storybook loads but app routes break | Storybook replacing entire app entry point | Use dedicated route approach instead of replacing `App.tsx` |
| Metro bundler crash with `require.context` error | `unstable_allowRequireContext` not enabled | `withStorybook` enables this automatically; verify it is the outermost wrapper |
| Storybook stories from `packages/ui` not found | Story glob path incorrect | Use relative path from Metro config root: `'../../../packages/ui/src/**/*.stories.@(ts|tsx)'` |
| PaperProvider theme missing in stories | No decorator wrapping stories with provider | Add PaperProvider decorator in `preview.tsx` (see example above) |

### `@storybook/addon-react-native-web` Status

**Deprecated.** The Webpack-based `@storybook/addon-react-native-web` (v0.0.29) has been replaced by `@storybook/react-native-web-vite` (v10.3.5). The Vite framework is faster, more stable, and actively maintained. Migrate to the Vite framework if you need web-rendered Storybook for visual regression testing.

### Sources
- [@storybook/react-native GitHub](https://github.com/storybookjs/react-native) -- v10 setup, Metro config, Expo Router integration (HIGH)
- [Callstack blog: swap between Storybook 10 and app](https://www.callstack.com/blog/how-to-cleanly-swap-between-react-native-storybook-10-and-your-app) -- Conditional rendering pattern (HIGH)
- [Storybook React Native Web Vite docs](https://storybook.js.org/docs/get-started/frameworks/react-native-web-vite) -- Web Storybook framework setup (HIGH)
- npm registry -- @storybook/react-native@10.3.1, @storybook/react-native-web-vite@10.3.5 verified 2026-04-17 (HIGH)

---

## Deep Dive: Token Architecture

**Confidence:** HIGH -- sourced from React Native Paper official theming docs, MD3DarkTheme source code analysis, and Turborepo monorepo patterns.

### Token File Structure in Turborepo

The tokens live in `packages/ui` and are consumed by both the mobile app (via RN Paper's PaperProvider) and the web dashboard (via CSS custom properties or direct TS import). The key principle: **tokens are plain TypeScript objects with `as const` assertions** -- no CSS-in-JS runtime, no build step required.

```
packages/
  ui/
    src/
      theme/
        tokens/
          colors.ts            # Color palette (light + dark variants)
          spacing.ts           # 8px grid scale
          typography.ts        # 7-level type scale with Devanagari support
          elevation.ts         # MD3 elevation levels
          border-radius.ts     # Corner radius scale
          animation.ts         # Duration + easing constants
          index.ts             # Re-exports all token modules
        theme.ts               # RN Paper theme extending MD3LightTheme
        theme-dark.ts          # Dark theme (deferred but structurally ready)
        types.ts               # AppTheme type + useAppTheme hook
        web-tokens.ts          # CSS custom property generator (Phase 9)
        index.ts               # Public API
```

### RN Paper `MD3Theme` Type Extension Pattern

React Native Paper v5 made `Theme` an interface rather than a type, enabling TypeScript global augmentation. However, the **recommended approach** for custom tokens is simpler -- use a typed wrapper hook rather than global augmentation:

```typescript
// packages/ui/src/theme/types.ts
import { useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import type { colors } from './tokens/colors';
import type { spacing } from './tokens/spacing';
import type { typography } from './tokens/typography';
import type { elevation } from './tokens/elevation';
import type { borderRadius } from './tokens/border-radius';

// Extend the MD3 theme type with Breeyo-specific tokens
export interface AppTheme extends MD3Theme {
  colors: MD3Theme['colors'] & typeof colors;
  spacing: typeof spacing;
  customTypography: typeof typography;
  elevation: typeof elevation;
  borderRadius: typeof borderRadius;
}

// This is the ONLY theme hook exported from packages/ui
// Never use useTheme() from react-native-paper directly
export const useAppTheme = () => useTheme<AppTheme>();
```

**Why `useTheme<AppTheme>()` rather than `declare global`:** The generic parameter approach is officially documented by RN Paper and avoids polluting the global namespace. It ensures that every component importing `useAppTheme` from `@breeyo/ui` gets the correct type. The `declare global` approach is valid but introduces complexity when multiple theme shapes exist (e.g., light vs. dark with different token sets).

### Token Format: TypeScript Objects, Not CSS Custom Properties

For Phase 2, tokens are **plain TypeScript objects with `as const`**. CSS custom properties are generated on-demand for the web dashboard in Phase 9.

**Why not CSS custom properties from the start:**
- React Native does not support CSS custom properties
- RN Paper's theme system expects JS objects
- `as const` gives full literal types for TypeScript safety
- CSS generation is a one-way transformation added later

**Token format:**
```typescript
// packages/ui/src/theme/tokens/colors.ts
export const lightColors = {
  primary: '#00897B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#A7F3EC',
  onPrimaryContainer: '#002019',
  secondary: '#FFB300',
  onSecondary: '#3F2E00',
  secondaryContainer: '#FFE08A',
  onSecondaryContainer: '#231B00',
  tertiary: '#5C6BC0',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#DEE0FF',
  onTertiaryContainer: '#151A5C',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  background: '#FAFDF9',
  onBackground: '#191C1B',
  surface: '#FAFDF9',
  onSurface: '#191C1B',
  surfaceVariant: '#DBE5E1',
  onSurfaceVariant: '#3F4945',
  outline: '#6F7975',
  outlineVariant: '#BFC9C4',
  // Breeyo semantic extensions (not in MD3 core)
  success: '#2E7D32',
  onSuccess: '#FFFFFF',
  successContainer: '#C8E6C9',
  onSuccessContainer: '#003106',
  warning: '#F57F17',
  onWarning: '#FFFFFF',
  warningContainer: '#FFF9C4',
  onWarningContainer: '#3E2E00',
} as const;

// Dark variants -- structurally identical, different values
// Following MD3DarkTheme pattern: primary uses palette tone 80, container uses tone 30
export const darkColors = {
  primary: '#4FD8C9',       // Lighter teal for dark backgrounds
  onPrimary: '#003730',
  primaryContainer: '#005048',
  onPrimaryContainer: '#A7F3EC',
  secondary: '#FFCA28',
  onSecondary: '#3F2E00',
  secondaryContainer: '#5C4500',
  onSecondaryContainer: '#FFE08A',
  tertiary: '#BDC5FF',
  onTertiary: '#262F71',
  tertiaryContainer: '#3D4689',
  onTertiaryContainer: '#DEE0FF',
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  background: '#191C1B',
  onBackground: '#E1E3E0',
  surface: '#191C1B',
  onSurface: '#E1E3E0',
  surfaceVariant: '#3F4945',
  onSurfaceVariant: '#BFC9C4',
  outline: '#899390',
  outlineVariant: '#3F4945',
  success: '#81C784',
  onSuccess: '#003910',
  successContainer: '#1B5E20',
  onSuccessContainer: '#C8E6C9',
  warning: '#FFD54F',
  onWarning: '#3E2E00',
  warningContainer: '#E65100',
  onWarningContainer: '#FFF9C4',
} as const;

// Default export for Phase 2 (light mode only per D-05)
export const colors = lightColors;
```

### How Next.js Web Dashboard Consumes Tokens (Phase 9 Preview)

Two consumption paths, both from the same source:

```typescript
// Path 1: Direct TypeScript import (simpler, works in Next.js server/client components)
import { colors, spacing } from '@breeyo/ui/theme/tokens';

// Use in styled-components, CSS modules, or inline styles
const styles = {
  backgroundColor: colors.primary,
  padding: spacing.md,
};

// Path 2: CSS custom properties (for global stylesheet consumption)
// packages/ui/src/theme/web-tokens.ts
import { lightColors, darkColors } from './tokens/colors';
import { spacing } from './tokens/spacing';
import { typography } from './tokens/typography';

export function generateCSSVariables(mode: 'light' | 'dark' = 'light'): string {
  const c = mode === 'light' ? lightColors : darkColors;
  return Object.entries(c)
    .map(([key, value]) => `  --color-${toKebab(key)}: ${value};`)
    .join('\n');
}

function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// Generates:
//   --color-primary: #00897B;
//   --color-on-primary: #FFFFFF;
//   --color-primary-container: #A7F3EC;
//   ...
```

### Dark Mode Readiness (D-05: Light Only for Beta)

The token architecture prepares for dark mode by:

1. **Separate color files for light and dark**: `lightColors` and `darkColors` objects with identical keys
2. **Theme factory function**: Creates either theme variant from the same token structure
3. **MD3DarkTheme as reference**: RN Paper's `MD3DarkTheme` spreads `MD3LightTheme` and only overrides `dark: true`, `mode: 'adaptive'`, and `colors`. Breeyo follows the same pattern.

```typescript
// packages/ui/src/theme/theme.ts
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { lightColors, darkColors } from './tokens/colors';
import { spacing } from './tokens/spacing';
import { typography } from './tokens/typography';
import { elevation } from './tokens/elevation';
import { borderRadius } from './tokens/border-radius';

function createTheme(mode: 'light' | 'dark') {
  const baseTheme = mode === 'light' ? MD3LightTheme : MD3DarkTheme;
  const themeColors = mode === 'light' ? lightColors : darkColors;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...themeColors,
    },
    spacing,
    typography: {
      ...baseTheme.fonts,
      displayLarge: { ...baseTheme.fonts.displayLarge, ...typography.display },
      headlineLarge: { ...baseTheme.fonts.headlineLarge, ...typography.heading1 },
      headlineMedium: { ...baseTheme.fonts.headlineMedium, ...typography.heading2 },
      titleLarge: { ...baseTheme.fonts.titleLarge, ...typography.subheading },
      bodyLarge: { ...baseTheme.fonts.bodyLarge, ...typography.body },
      labelSmall: { ...baseTheme.fonts.labelSmall, ...typography.caption },
      labelLarge: { ...baseTheme.fonts.labelLarge, ...typography.overline },
    },
    elevation,
    borderRadius,
    customTypography: typography,
  } as const;
}

// Phase 2: export light theme only (D-05)
export const breeyoTheme = createTheme('light');

// Phase future: dark mode addition is a single line
// export const breeyoDarkTheme = createTheme('dark');

export type AppTheme = ReturnType<typeof createTheme>;
```

**MD3DarkTheme elevation difference:** In dark mode, RN Paper uses opaque RGB elevation surfaces instead of shadows (e.g., `'rgb(37, 35, 42)'` for level1). This is because React Native's shadow system transfers to children. The `createTheme` function handles this automatically by spreading `MD3DarkTheme` which includes the correct elevation colors.

### Typography Scale for Devanagari (Hindi) + Latin (English)

Hindi/Devanagari is classified as a "tall" script in Material Design -- glyphs require more vertical space than Latin equivalents. The key adjustments:

```typescript
// packages/ui/src/theme/tokens/typography.ts

// Line height multipliers by script type
// Latin: 1.2-1.4x fontSize is typical
// Devanagari: minimum 1.5x fontSize to prevent clipping of matras (vowel marks)
// Using 1.5x as the universal minimum ensures both scripts render correctly

export const typography = {
  display:    { fontSize: 36, lineHeight: 54, fontWeight: '400' as const },  // 1.5x
  heading1:   { fontSize: 28, lineHeight: 42, fontWeight: '500' as const },  // 1.5x
  heading2:   { fontSize: 22, lineHeight: 33, fontWeight: '500' as const },  // 1.5x
  subheading: { fontSize: 18, lineHeight: 28, fontWeight: '500' as const },  // 1.55x
  body:       { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },  // 1.5x
  caption:    { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },  // 1.5x
  overline:   { fontSize: 10, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 1.5 }, // 1.6x
} as const;

// Font family: Use system default (Roboto on Android, SF Pro on iOS)
// Both platforms ship with Devanagari support in system fonts
// DO NOT use Noto Sans Bold for Hindi -- Google/Material Design
// recommends Regular weight only as Bold is "too heavy" for native speakers
```

**Important Devanagari considerations:**
- Use `fontWeight: '400'` (Regular) for Hindi body text, not '500' (Medium). Material Design guidance says Noto Sans Devanagari Medium is unavailable and Bold is too heavy.
- Line heights in the scale above are already Devanagari-safe (minimum 1.5x). This means Latin text will have slightly more generous line height than typical, but this improves readability for the veterinary context (busy vets glancing at screens).
- Test with real Hindi strings like "asdf" -- especially with stacked matras.

### Spacing Scale: 8px Grid

The spacing scale uses the 8px grid per D-04 with a 4px half-step for tight gaps:

```typescript
// packages/ui/src/theme/tokens/spacing.ts
export const spacing = {
  xs: 4,     // Half-step: icon gaps, badge padding
  sm: 8,     // 1x: minimum gap between elements
  md: 16,    // 2x: standard content padding
  lg: 24,    // 3x: section spacing
  xl: 32,    // 4x: major section breaks
  '2xl': 40, // 5x: screen-level padding
  '3xl': 48, // 6x: hero spacing
  '4xl': 56, // 7x: (rarely used)
  '5xl': 64, // 8x: (rarely used)
} as const;

// RN Paper already uses 8px internally for component spacing
// This scale aligns with and extends their internal system
```

### Sources
- [React Native Paper theming docs](http://oss.callstack.com/react-native-paper/docs/guides/theming/) -- TypeScript `useTheme<T>()` generic pattern (HIGH)
- [RN Paper MD3DarkTheme source](https://github.com/callstack/react-native-paper/blob/main/src/styles/themes/v3/DarkTheme.tsx) -- Dark theme color mapping, elevation handling (HIGH)
- [Material Design 3 typography](https://m3.material.io/styles/typography) -- Tall script recommendations (HIGH)
- [Turborepo React Native starter](https://vercel.com/templates/next.js/turborepo-react-native) -- Monorepo package sharing pattern (MEDIUM)
- [React Native line height issues](https://github.com/facebook/react-native/issues/29232) -- Devanagari rendering specifics (MEDIUM)

---

## Deep Dive: Android Animation Performance

**Confidence:** HIGH for Reanimated v4 APIs; MEDIUM for Android 8 specific behavior (needs physical device validation).

### Reanimated v4 Architecture

Reanimated 4.3.0 (current) runs all animations on the UI thread, independent of JavaScript. This is critical for mid-range Android 8 devices where the JS thread may be congested with business logic. Key architectural changes from v3:

- **CSS Animations API**: Declarative keyframe animations via `animationName` style property -- no shared values or hooks needed for simple animations
- **CSS Transitions API**: Automatic interpolation when style properties change state -- lower overhead than `useAnimatedStyle` for straightforward property changes
- **Worklets extracted**: Worklet runtime moved to `react-native-worklets` package -- can be used independently
- **New Architecture required**: Reanimated 4.x drops Legacy Architecture (Paper) support entirely. Requires React Native 0.76+ with Fabric. Expo SDK 52 enables this by default.

### Breeyo Animation Inventory

Based on the app's UX requirements, here are the specific animations needed and the recommended implementation for each:

| Animation | Where Used | Recommended API | Thread | Duration | Priority |
|-----------|------------|-----------------|--------|----------|----------|
| Loading shimmer | Queue list, EMR list, inventory | `react-native-fast-shimmer` (Reanimated powered) | UI | Continuous | Must have |
| Status badge color transition | Queue card status change | CSS Transitions (`transitionProperty`) | UI | 300ms | Must have |
| Screen slide transition | Stack navigation push/pop | Expo Router default (Reanimated powered) | UI | 250ms | Must have |
| Toast entrance/exit | Success/error feedback | FadeIn.duration(200) / FadeOut.duration(150) | UI | 150-200ms | Must have |
| FAB press feedback | Check In button, Add Item | Reanimated scale transform (withTiming) | UI | 100ms | Nice to have |
| Queue position update | Number changes in queue | CSS Transitions on opacity + transform | UI | 200ms | Nice to have |
| Pull to refresh | Queue list, any data list | Native ScrollView (no custom animation) | Native | N/A | Built-in |
| Bottom sheet open/close | Filter, patient details | @gorhom/bottom-sheet (built-in) | UI | 300ms | Built-in |

### CSS Transitions Pattern (Preferred for State-Driven Changes)

Reanimated 4's CSS Transitions are the recommended approach for most Breeyo animations. They are lower overhead than `useAnimatedStyle` because they only compute when a property actually changes:

```typescript
// Status badge with CSS transition on background color
import Animated from 'react-native-reanimated';

interface AnimatedStatusBadgeProps {
  status: QueueStatus;
}

const STATUS_COLORS = {
  waiting: '#FFE08A',     // secondaryContainer
  'in-consult': '#A7F3EC', // primaryContainer
  done: '#C8E6C9',        // successContainer
  'no-show': '#FFDAD6',   // errorContainer
} as const;

export function AnimatedStatusBadge({ status }: AnimatedStatusBadgeProps) {
  return (
    <Animated.View
      style={{
        backgroundColor: STATUS_COLORS[status],
        borderRadius: 9999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        // CSS Transitions -- runs on UI thread, zero boilerplate
        transitionProperty: ['backgroundColor'],
        transitionDuration: 300,
        transitionTimingFunction: 'ease-in-out',
      }}
    >
      {/* ... badge content ... */}
    </Animated.View>
  );
}
```

### CSS Keyframe Animation Pattern (Shimmer Alternative)

For shimmer/loading animations, CSS keyframes provide a clean declarative approach:

```typescript
// Shimmer animation using Reanimated 4 CSS Animations
import Animated from 'react-native-reanimated';

const shimmerKeyframes = {
  from: {
    opacity: 0.4,
  },
  '50%': {
    opacity: 0.7,
  },
  to: {
    opacity: 0.4,
  },
};

export function SkeletonCard() {
  return (
    <Animated.View
      style={{
        height: 80,
        backgroundColor: '#DBE5E1', // surfaceVariant
        borderRadius: 12,
        animationName: shimmerKeyframes,
        animationDuration: 1500,
        animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}
```

**However**, for multiple synchronized skeleton placeholders on a screen, `react-native-fast-shimmer` (v1.3.4) is still recommended because it drives all shimmers from a single shared animated value, reducing per-frame overhead.

### Entering/Exiting Animations for Toast and List Items

```typescript
// Toast notification entrance/exit
import Animated, { FadeIn, FadeOut, SlideInUp } from 'react-native-reanimated';

export function ToastContainer({ message, visible }: ToastProps) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.toast}
    >
      <Text>{message}</Text>
    </Animated.View>
  );
}

// Queue card list item -- fade in when new patient added
export function QueueCardAnimated({ entry, index }: QueueCardProps) {
  return (
    <Animated.View
      entering={FadeIn.delay(index * 50).duration(200)}
      exiting={FadeOut.duration(150)}
    >
      <QueueCard entry={entry} />
    </Animated.View>
  );
}
```

### Performance Budgets for Mid-Range Android 8+

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Frame rate | 60 FPS sustained | Flipper FPS monitor, `adb shell dumpsys gfxinfo` |
| Animation frame drops | < 3 dropped frames per animation | React DevTools Performance tab |
| Simultaneous animations | Maximum 100 animated components | Reanimated official guidance for low-end Android |
| Animation duration | 150-300ms for transitions | Shorter = less time for frame drops to accumulate |
| JS thread block tolerance | Animations unaffected by JS blocking | Reanimated UI thread animations are JS-independent |

**Android 8 specific constraints:**
- Limited GPU/CPU compared to modern devices
- Prefer `opacity` and `transform` animations (GPU-composited) over `width`, `height`, `margin`, `padding` (trigger layout recalculation every frame)
- Avoid `withSpring` on Android 8 -- spring physics calculate indefinitely until rest threshold. Use `withTiming` with explicit duration instead.
- Avoid animating more than 5-10 components simultaneously during initial render (e.g., stagger entering animations)

### UI Thread vs. JS Thread Decision Table

| Runs on UI Thread (Safe) | Runs on JS Thread (Avoid) |
|--------------------------|---------------------------|
| `useAnimatedStyle` with worklets | Core `Animated` API |
| CSS Animations (`animationName`) | `LayoutAnimation.configureNext()` (broken in SDK 52) |
| CSS Transitions (`transitionProperty`) | Reading `sharedValue.value` in render |
| Entering/Exiting animations | `Animated.timing()` from RN core |
| `withTiming`, `withSpring`, `withDecay` | `setNativeProps` |
| Gesture-driven animations via `useAnimatedGestureHandler` | |

### Moti Library Assessment

**Not recommended.** Moti (v0.30.0) was last published over a year ago (as of April 2026). It is built on top of Reanimated (not an alternative) and adds an abstraction layer that:
- Is no longer actively maintained
- Does not support Reanimated v4's CSS APIs
- Adds bundle size without clear benefit now that Reanimated v4's CSS APIs provide similar declarative simplicity

Use Reanimated v4 CSS Animations/Transitions directly instead.

### Lottie vs. Reanimated for Loading/Empty States

| Factor | Lottie (lottie-react-native 7.3.6) | Reanimated 4 CSS Animations | Recommendation |
|--------|-------------------------------------|------------------------------|----------------|
| Android FPS | ~17 FPS on low-end (Sony Xperia Z3 benchmark) | 60 FPS (UI thread) | Reanimated |
| File size per animation | 10-240KB JSON | 0 (code-defined) | Reanimated |
| Designer workflow | After Effects export | Developer-coded | Lottie |
| Complex illustrations | Excellent | Limited to transforms/opacity | Lottie for complex art |
| Memory usage | ~23-49MB (Java/Native) | Minimal (shared worklet runtime) | Reanimated |

**Recommendation for Breeyo:** Use Reanimated v4 CSS Animations for all functional animations (shimmer, transitions, badge changes). Reserve Lottie only if custom illustrated animations are needed for empty states (D-13) -- and even then, consider Rive (`rive-react-native` v9.8.2) which runs at 60 FPS on the same devices where Lottie runs at 17 FPS, and produces 10-15x smaller files.

### Sources
- [React Native Reanimated performance guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) -- Component limits, UI thread patterns (HIGH)
- [Reanimated entering/exiting docs](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/) -- Predefined animations, customization API (HIGH)
- [Reanimated 4 CSS Animations tutorial](https://reactnativerelay.com/article/mastering-react-native-reanimated-4-css-animations-transitions-worklets) -- CSS keyframes and transitions patterns (HIGH)
- [Callstack: Lottie vs Rive](https://www.callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation) -- Performance benchmarks on low-end Android (MEDIUM)
- [react-native-fast-shimmer](https://www.callstack.com/blog/performant-and-cross-platform-shimmers-in-react-native-apps) -- Shared value shimmer architecture (MEDIUM)
- [Moti GitHub](https://github.com/nandorojo/moti) -- Last release 0.30.0, over 1 year stale (HIGH for maintenance status)
- npm registry -- react-native-reanimated@4.3.0, lottie-react-native@7.3.6, rive-react-native@9.8.2, moti@0.30.0 verified 2026-04-17 (HIGH)
- [Expo SDK 52 LayoutAnimation issue](https://github.com/expo/expo/issues/32868) -- LayoutAnimation.configureNext() broken (HIGH)

---

## Deep Dive: Walk-in Queue UX Patterns

**Confidence:** MEDIUM -- based on healthcare queue management research, mobile UX patterns from multiple sources, and UX design principles. No single authoritative source exists for veterinary queue UX specifically.

### Real-World Queue Management UX Patterns

Research across healthcare/restaurant/service queue management apps (Qminder, WaitWhile, NextMe, ScanQueue, QueueBee) reveals consistent patterns:

**Core principles:**
1. **Glanceability**: Queue status must be readable from a distance / at a glance. Large text, bold status colors, minimal cognitive load.
2. **Predictability**: Users must always know what happens next. Clear state transitions, no hidden states.
3. **Responsiveness**: Status changes must appear within 1-2 seconds across all connected devices.
4. **Minimal friction**: Check-in should be the fastest possible action -- every tap removed is a win.

### 2-Tap Check-In Flow Design

The "2-tap check-in" requirement (QUE-01, UX-05) must handle two scenarios: returning patients and new patients.

**Returning patient (true 2-tap):**
```
Tap 1: FAB "Check In" on Queue screen
  -> Opens BottomSheet with recent patients list + search bar
  -> Recent patients shown as cards with pet name + owner name + species icon

Tap 2: Tap patient card
  -> Patient added to queue at bottom with status "Waiting"
  -> Toast: "Buddy (dog) checked in - Position #4"
  -> BottomSheet closes
  -> Queue list auto-scrolls to show new entry
```

**New patient (3-tap minimum -- acceptable exception):**
```
Tap 1: FAB "Check In" on Queue screen
  -> Opens BottomSheet with recent patients + search

Tap 2: Tap "New Patient" button at bottom of BottomSheet
  -> Opens simplified registration wizard (name, species, owner phone)

Tap 3+: Complete minimal registration form, tap "Check In"
  -> Patient created AND added to queue simultaneously
```

**UX details for the check-in BottomSheet:**
```typescript
// Check-in BottomSheet layout (organism component)
// Snap points: 50% (default) and 90% (when searching)

<BottomSheet snapPoints={['50%', '90%']}>
  {/* Search bar at top -- auto-focuses keyboard */}
  <SearchBar
    placeholder="Search patient or owner phone..."
    onChangeText={setQuery}
    autoFocus={false}  // Don't auto-focus: many check-ins are tap-on-recent
  />

  {/* Recent patients (last 7 days, sorted by last visit) */}
  <SectionHeader title="Recent Patients" />
  <FlatList
    data={recentPatients}
    renderItem={({ item }) => (
      <PatientCheckInCard
        petName={item.petName}
        species={item.species}
        ownerName={item.ownerName}
        lastVisit={item.lastVisit}
        onPress={() => checkIn(item.id)}  // Tap 2: instant check-in
      />
    )}
    keyExtractor={item => item.id}
  />

  {/* Search results replace recent when query is active */}

  {/* Fixed bottom: New Patient button */}
  <BottomAction>
    <Button
      variant="outlined"
      label="New Patient"
      icon="plus"
      onPress={openNewPatientWizard}
    />
  </BottomAction>
</BottomSheet>
```

### Real-Time Status Board Layout

The queue status board (D-36) is the **home screen** of the app. It must be optimized for one-handed glancing while the vet may be holding an animal.

**Layout specification:**

```
+------------------------------------------+
|  [Clinic Name]            [3 waiting] [+] |  <- AppBar with count badge + FAB
+------------------------------------------+
|  Pull to refresh                          |
|                                           |
|  IN CONSULT                               |  <- Section header (sticky)
|  +--------------------------------------+ |
|  | #2  Buddy (Golden Retriever)    [IC] | |  <- Highlighted card, larger
|  |     Owner: Priya Sharma              | |
|  |     Checked in 10:15 AM  (25 min)   | |
|  +--------------------------------------+ |
|                                           |
|  WAITING (3)                              |  <- Section header (sticky)
|  +--------------------------------------+ |
|  | #3  Tiger (Cat)                 [W]  | |  <- Standard card
|  |     Owner: Amit Patel                | |
|  |     10:32 AM  (8 min)   [Call Next]  | |
|  +--------------------------------------+ |
|  +--------------------------------------+ |
|  | #4  Luna (Labrador)            [W]   | |
|  |     Owner: Deepa Nair               | |
|  |     10:45 AM  (est. 15 min wait)    | |
|  +--------------------------------------+ |
|  +--------------------------------------+ |
|  | #5  Max (Pomeranian)           [W]   | |
|  |     Owner: Rajesh Kumar              | |
|  |     10:52 AM  (est. 25 min wait)    | |
|  +--------------------------------------+ |
|                                           |
|  DONE TODAY (2)                           |  <- Collapsed by default
|  > Tap to expand                          |
|                                           |
+------------------------------------------+
| [Queue]  [Patients]  [Inventory]  [More] |  <- Bottom tab bar
+------------------------------------------+
```

**Key layout decisions:**

| Decision | Value | Rationale |
|----------|-------|-----------|
| Visible patients without scroll | 3-4 cards | Typical queue depth for solo vet clinic |
| Card height | ~88px (spacious per D-32) | Room for pet name, owner, time, status badge |
| Section grouping | In Consult, Waiting, Done | Status-based grouping mirrors mental model |
| "In Consult" card | Visually distinct (primary container background, larger) | Vet needs to know who is currently being seen |
| "Done" section | Collapsed by default | Reduce visual noise; expandable for reference |
| Queue position | Absolute number (#3, #4, #5) | Simpler than "2 ahead of you" for staff-facing tool |
| Wait time display | Check-in time + elapsed for current, estimated for others | "10:32 AM (8 min)" more useful than just position |
| "Call Next" button | Visible on first waiting patient only | Single clear action; prevents confusion |
| FAB | Bottom-right, "Check In" with plus icon | D-30: primary action, always visible |
| Pull to refresh | Standard gesture | Fallback for real-time sync issues |

### Consultation Transition: "Call Next Patient"

When the vet taps "Call Next" on a waiting patient:

**Immediate feedback (optimistic UI):**
1. The waiting patient's card animates up to the "In Consult" section (Reanimated `FadeIn` + layout transition)
2. Status badge transitions from "Waiting" (amber) to "In Consult" (teal) via CSS Transition
3. The previous "In Consult" patient (if any) moves to "Done" section
4. Toast: "Calling Tiger (Cat) - starting consultation"

**On other connected devices:**
5. Socket.IO/real-time broadcast pushes the status change
6. Other devices' queue boards update within 1-2 seconds
7. If push notifications are enabled (Phase 8), patient owner gets WhatsApp notification (simulated in Beta)

**No sound/vibration for Beta:** Keep it simple. Sound/vibration feedback adds device permission complexity and could be disruptive in a clinic with multiple animals. Defer to post-Beta if users request it.

```typescript
// Queue transition handler (conceptual -- Phase 3 implements logic)
async function callNextPatient(patientId: string) {
  // Optimistic update: move card immediately
  optimisticUpdateQueue(patientId, 'in-consult');

  // Mark previous in-consult as done (if any)
  const currentConsult = queue.find(e => e.status === 'in-consult');
  if (currentConsult) {
    optimisticUpdateQueue(currentConsult.id, 'done');
  }

  // Server sync (background)
  try {
    await api.queue.updateStatus(patientId, 'in-consult');
  } catch (error) {
    // Rollback optimistic update
    rollbackQueueUpdate(patientId);
    showToast({ type: 'error', message: 'Failed to update queue. Please try again.' });
  }
}
```

### Queue Position Display

**Use absolute number (#3, #4) rather than "X ahead of you"** for this app because:
- Breeyo's queue is **staff-facing** (vet and front desk see it), not patient-facing
- Staff think in terms of "who is #3" not "3 people ahead of someone"
- Absolute numbers align with the physical whiteboard metaphor (D-36)
- Estimated wait time is shown alongside for time-based planning

**Wait time estimation (simple formula for Beta):**
```
estimated_wait = (position_in_queue - 1) * average_consultation_duration
average_consultation_duration = rolling average of last 10 consultations (default: 15 min)
```

### Walk-in + Scheduled Appointment Coexistence

The queue board must display both walk-ins and scheduled appointments when Phase 8 (Scheduling) is implemented. Design the data model now to support this:

```typescript
// QueueEntry type supports both sources
interface QueueEntry {
  id: string;
  patient: {
    petName: string;
    species: 'dog' | 'cat' | 'bird' | 'exotic' | 'other';
    ownerName: string;
  };
  status: 'waiting' | 'in-consult' | 'done' | 'no-show';
  source: 'walk-in' | 'appointment';  // Distinguishes origin
  checkedInAt: Date;
  appointmentTime?: Date;  // Only for scheduled appointments
  position: number;
  estimatedWaitMinutes?: number;
}
```

**Visual differentiation on the board:**
- Walk-ins: Standard card
- Scheduled appointments: Small calendar icon next to position number, appointment time shown

**Ordering rule:** Scheduled appointments get priority at their time slot. Walk-ins fill gaps. The exact interleaving algorithm is Phase 3/Phase 8 scope -- the UI just renders whatever order the API returns.

### Accessibility: Screen Reader for Queue Status

```typescript
// QueueCard accessibility implementation
<View
  accessibilityRole="button"
  accessibilityLabel={`Queue position ${entry.position}. ${entry.patient.petName}, ${entry.patient.species}, owned by ${entry.patient.ownerName}. Status: ${entry.status}. Checked in at ${formatTime(entry.checkedInAt)}.`}
  accessibilityHint={
    entry.status === 'waiting'
      ? 'Double tap to start consultation with this patient'
      : undefined
  }
  accessibilityActions={[
    ...(entry.status === 'waiting' ? [{ name: 'activate', label: 'Call next' }] : []),
    { name: 'longpress', label: 'More options' },
  ]}
  onAccessibilityAction={(event) => {
    switch (event.nativeEvent.actionName) {
      case 'activate':
        callNextPatient(entry.id);
        break;
      case 'longpress':
        openPatientActions(entry.id);
        break;
    }
  }}
>
```

**Live region for queue updates:**
```typescript
// Announce queue changes to screen readers
<View
  accessibilityRole="status"
  accessibilityLiveRegion="polite"
>
  <Text>{queueSummary}</Text>
  {/* e.g., "3 patients waiting, 1 in consultation" */}
</View>
```

### Offline Queue Updates

When connectivity drops mid-queue:

**What works offline:**
- Viewing current queue state (cached locally)
- Changing status of patients (optimistic, queued for sync)
- Adding new walk-in from locally cached patient list
- Updating queue position (local reorder)

**What does NOT work offline:**
- Real-time updates from other devices
- Searching for patients not in local cache
- Estimated wait time (requires server calculation)

**Offline indicator:**
```typescript
// Banner at top of queue screen when offline
{!isOnline && (
  <Surface style={styles.offlineBanner}>
    <Icon name="wifi-off" size={16} />
    <Typography variant="caption">
      Offline -- changes will sync when connected
    </Typography>
  </Surface>
)}
```

**Sync strategy (implemented in Phase 3/Phase 10):**
- Queue actions stored in local SQLite outbox with idempotency keys
- On reconnect: batch sync pending actions in order
- Conflict resolution: server timestamp wins for status changes (last-write-wins)
- If conflicting status change detected: show merge dialog to user

### Sources
- [Qminder queue management](https://www.qminder.com/blog/queue-management/25-plus-best-patient-queueing-software/) -- Healthcare queue software patterns (MEDIUM)
- [Nemo-Q design principles](https://nemo-q.com/blog/design-principles-digital-queue-management/) -- Queue UX design principles (MEDIUM)
- [Medira App UX study](https://medium.com/@amilafr25/ui-ux-study-case-of-hospital-queue-mobile-app-called-medira-app-fef2b700ad2b) -- Hospital queue mobile app case study (MEDIUM)
- [ScanQueue clinic system](https://scanqueue.com/solutions/clinics) -- Clinic-specific queue check-in patterns (MEDIUM)
- [React Native offline sync patterns](https://dev.to/sathish_daggula/react-native-offline-sync-with-sqlite-queue-4975) -- SQLite outbox, idempotency keys, batch sync (MEDIUM)
- [Healthcare UI design trends 2026](https://www.eleken.co/blog-posts/user-interface-design-for-healthcare-applications) -- Current healthcare UX patterns (LOW -- general, not queue-specific)

---

## Deep Dive Research Metadata

**Research date:** 2026-04-17
**Areas covered:** Storybook + Expo integration, Token architecture, Android animation performance, Walk-in queue UX
**Total sources consulted:** 25+ (web searches, official docs, GitHub repos, npm registry)

**Confidence by deep dive area:**
- Storybook + Expo: HIGH -- official docs and working examples verified
- Token architecture: HIGH -- RN Paper source code analyzed, Turborepo patterns well-documented
- Android animation: HIGH (APIs) / MEDIUM (Android 8 specific perf -- needs device testing)
- Walk-in queue UX: MEDIUM -- synthesized from multiple queue management sources; no vet-specific UI library exists

**Updated Open Question (from main research):**
- Open Question #3 (Visual Regression Testing) now has a clear answer: use `@storybook/react-native-web-vite` v10.3.5 (not the deprecated `addon-react-native-web`) for Chromatic integration. On-device `@storybook/react-native` v10.3.1 for development.
