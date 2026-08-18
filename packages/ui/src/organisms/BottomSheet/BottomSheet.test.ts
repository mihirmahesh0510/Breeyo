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
    vi.mocked(useEffect).mockClear();
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

  it('declares [visible] as the effect dependency, not every render', async () => {
    // This is the regression the fix actually targets: Keyboard.dismiss()
    // used to run in the render body, re-firing on every re-render while the
    // sheet stayed visible (e.g. each keystroke inside the sheet's own
    // inputs, which blurred the very field being typed into). The test-infra
    // `useEffect` mock (packages/ui/tests/setup.ts) invokes the callback
    // unconditionally regardless of the deps array — it does not reproduce
    // React's own dependency-diffing — so the real guarantee this test can
    // make is that the component *declares* the correct dependency array,
    // which is what React's diffing acts on in production.
    const { BottomSheet } = await import('./BottomSheet');
    BottomSheet({ visible: true, onDismiss: vi.fn(), children: null });
    expect(vi.mocked(useEffect).mock.calls[0][1]).toEqual([true]);
  });
});
