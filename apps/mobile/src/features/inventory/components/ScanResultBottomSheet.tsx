import React, { forwardRef } from 'react';
import { StyleSheet } from 'react-native';
import GorhomBottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';

// --- Constants ---

/** 30% = single-item peek, 60% = expanded list for continuous scanning (UI-SPEC). */
export const SCAN_RESULT_SNAP_POINTS: string[] = ['30%', '60%'];

const COLORS = {
  background: '#FFFBF5',
  handle: '#CAC4D0',
} as const;

// --- Component ---

export type ScanResultBottomSheetRef = React.ElementRef<typeof GorhomBottomSheet>;

export interface ScanResultBottomSheetProps {
  children: React.ReactNode;
  /** Called when the user drags the sheet closed (enablePanDownToClose). */
  onClose?: () => void;
  onChange?: (index: number) => void;
  testID?: string;
}

/**
 * @gorhom/bottom-sheet wrapper for barcode scan results (D-13/D-17/D-18).
 *
 * RESEARCH.md Pitfall 1: `enableDynamicSizing={false}` (fixed snap points
 * instead) avoids the black-camera-preview bug some Android devices hit
 * when @gorhom/bottom-sheet's gesture handler and VisionCamera's preview
 * both try to manage sizing dynamically. `index={-1}` keeps the sheet
 * collapsed/hidden until a scan resolves; the screen calls
 * `ref.current?.snapToIndex(0)` to reveal it.
 */
export const ScanResultBottomSheet = forwardRef<ScanResultBottomSheetRef, ScanResultBottomSheetProps>(
  function ScanResultBottomSheet({ children, onClose, onChange, testID }, ref) {
    return (
      <GorhomBottomSheet
        ref={ref}
        index={-1}
        snapPoints={SCAN_RESULT_SNAP_POINTS}
        enablePanDownToClose
        enableDynamicSizing={false}
        onClose={onClose}
        onChange={onChange}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.content} testID={testID}>
          {children}
        </BottomSheetView>
      </GorhomBottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  background: {
    backgroundColor: COLORS.background,
  },
  handle: {
    backgroundColor: COLORS.handle,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
});
