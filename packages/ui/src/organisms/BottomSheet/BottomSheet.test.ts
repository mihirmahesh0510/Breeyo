import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
