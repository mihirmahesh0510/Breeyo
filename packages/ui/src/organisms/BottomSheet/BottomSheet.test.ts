import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { useTheme } from 'react-native-paper';
import { Keyboard } from 'react-native';

const FAKE_THEME = {
  colors: { surface: '#fff', onSurfaceVariant: '#333' },
  borderRadius: { lg: 12, full: 9999 },
  spacing: { sm: 8, md: 16 },
};

describe('BottomSheet', () => {
  beforeEach(() => {
    vi.mocked(useTheme).mockReturnValue(FAKE_THEME as any);
    vi.mocked(Keyboard.dismiss).mockClear();
    // Restore the shared setup.ts default (invoke immediately, ignore deps)
    // in case a prior test in this file installed its own diffing
    // implementation.
    vi.mocked(useEffect).mockReset();
    vi.mocked(useEffect).mockImplementation((fn: () => void) => fn());
  });

  it('dismisses a previously-focused keyboard when it becomes visible', async () => {
    const { BottomSheet } = await import('./BottomSheet');
    BottomSheet({ visible: true, onDismiss: vi.fn(), children: null });
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  });

  it('does not touch the keyboard while hidden', async () => {
    const { BottomSheet } = await import('./BottomSheet');
    BottomSheet({ visible: false, onDismiss: vi.fn(), children: null });
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
  });

  it('does not re-fire Keyboard.dismiss on a re-render where visible stays true', async () => {
    // This is the regression the fix actually targets: Keyboard.dismiss()
    // used to run unconditionally in the render body, re-firing on every
    // re-render while the sheet stayed visible -- e.g. each keystroke typed
    // into the sheet's own inputs, which blurred the very field being typed
    // into. The shared test-infra `useEffect` mock (packages/ui/tests/setup.ts)
    // ignores the dependency array entirely (it just invokes the callback),
    // so it can't by itself distinguish "gated on [visible]" from "runs every
    // render". This test adds a real (if minimal) dependency-diffing
    // implementation local to itself -- only re-invoking the effect when the
    // deps array actually changed -- so it exercises the exact guarantee
    // React's own diffing provides in production, not just an implementation
    // detail of how the effect is declared.
    let previousDeps: unknown[] | undefined;
    vi.mocked(useEffect).mockImplementation((fn: () => void, deps?: unknown[]) => {
      const changed =
        !previousDeps || !deps || deps.length !== previousDeps.length ||
        deps.some((d, i) => d !== previousDeps![i]);
      previousDeps = deps;
      if (changed) fn();
    });

    const { BottomSheet } = await import('./BottomSheet');
    BottomSheet({ visible: true, onDismiss: vi.fn(), children: null }); // first render
    BottomSheet({ visible: true, onDismiss: vi.fn(), children: null }); // re-render, visible unchanged

    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  });
});
