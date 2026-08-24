import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type CameraMountError } from 'expo-camera';
import { EXPO_CAMERA_BARCODE_TYPES } from '@breeyo/types';
import { BreeyoIconButton, showToast } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useBarcodeScan } from '../hooks/useBarcodeScan';
import { useOfflineStockActions } from '../hooks/useOfflineStockActions';
import { useScannerStore, type ScannerMode } from '../stores/scanner.store';
import { ScanRegionOverlay } from '../components/ScanRegionOverlay';
import {
  ScanResultBottomSheet,
  type ScanResultBottomSheetRef,
} from '../components/ScanResultBottomSheet';
import { ScanResultCard } from '../components/ScanResultCard';
import { ManualBarcodeInput } from '../components/ManualBarcodeInput';
import { UnknownBarcodePrompt } from '../components/UnknownBarcodePrompt';
import { ContinuousScanList } from '../components/ContinuousScanList';

// --- Constants ---

const COLORS = {
  background: '#000000',
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  tertiary: '#E65100',
  tertiaryContainer: '#FFE0B2',
  onTertiaryContainer: '#BF360C',
  overlayText: '#FFFFFF',
} as const;

const VALID_MODES: ScannerMode[] = ['single', 'continuous', 'stockTake'];
const STALE_CACHE_MINUTES = 5; // UI-SPEC: cache staleness indicator threshold

function parseMode(value: string | undefined): ScannerMode {
  return VALID_MODES.includes(value as ScannerMode) ? (value as ScannerMode) : 'single';
}

function minutesAgo(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

// --- Component ---

/**
 * D-13/D-17/D-18/D-19/D-20: full-screen barcode scanner. Composes
 * expo-camera's `<CameraView>` (inline `onBarcodeScanned` prop +
 * `barcodeScannerSettings`) with a scan-region overlay, torch toggle,
 * manual entry, an offline banner, and a @gorhom/bottom-sheet for results --
 * either a single `ScanResultCard` (mode="single") or an accumulating
 * `ContinuousScanList` (mode="continuous"/"stockTake", D-18/D-38).
 *
 * ARCHITECTURE FIX (see 05-05-SUMMARY.md "Architecture Fix" section): this
 * screen originally targeted `react-native-vision-camera` +
 * `@mgcrea/vision-camera-barcode-scanner` per RESEARCH.md's primary
 * recommendation, but the installed `react-native-vision-camera@5.2.2` is a
 * Nitro-architecture rewrite with no `frameProcessor`/classic `<Camera>` API
 * at all -- architecturally incompatible with `@mgcrea`'s plugin, not a
 * version-pinning issue. Replaced with expo-camera's `CameraView`, the
 * Expo-blessed fallback RESEARCH.md's "Open Question 1" named explicitly.
 * `CameraView`'s `onBarcodeScanned` is a real continuous-scanning callback
 * (verified directly in `expo-camera`'s `CameraView.js`: it throttles
 * *identical, repeated* barcode payloads to once per 500ms via
 * `_onObjectDetected`, but is NOT a single-shot/scan-once API -- a new or
 * different barcode fires immediately). That 500ms native throttle composes
 * cleanly underneath Task 1's 1500ms `isDuplicate` app-level dedupe window,
 * which is what D-18's continuous scanning mode relies on.
 */
export function BarcodeScannerScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = parseMode(params.mode);
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const { isOffline, lastSynced } = useOfflineSync();

  const torchOn = useScannerStore((state) => state.torchOn);
  const setTorch = useScannerStore((state) => state.setTorch);

  const [permission, requestPermission] = useCameraPermissions();
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    if (permission?.status === 'undetermined') {
      void requestPermission();
    }
  }, [permission?.status, requestPermission]);

  const {
    onBarcodeScanned,
    scannedItems,
    lastResult,
    isLooking,
    actualCounts,
    setActualCount,
    dismissResult,
  } = useBarcodeScan({ mode, clinicId: activeClinicId ?? '' });

  // Plan 10-04 (D-04, D-15 to D-17): every item this session resolves to
  // (online or from Phase 5's own offline barcode cache) is seeded into the
  // Phase 10 same-day working-set cache, so the item has local stock-in-
  // motion data on hand the moment a receive/dispense/adjust/return action
  // is attempted against it, and so a pending-sync count is available to
  // show the same calm badge treatment the queue board already uses (D-18
  // to D-21) instead of a new bespoke indicator.
  const { cacheScannedItem, pendingCount } = useOfflineStockActions();
  useEffect(() => {
    if (lastResult.status !== 'found') return;
    const { item } = lastResult;
    void cacheScannedItem({
      itemId: item.itemId,
      name: item.itemName,
      category: item.category,
      unit: item.unit,
      currentStock: item.currentStock,
    });
  }, [lastResult, cacheScannedItem]);

  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [pulseTrigger, setPulseTrigger] = useState<number | undefined>(undefined);
  const sheetRef = useRef<ScanResultBottomSheetRef>(null);

  useEffect(() => {
    if (lastResult.status === 'found') {
      setPulseTrigger(Date.now());
      sheetRef.current?.snapToIndex(0);
    } else if (lastResult.status === 'not_found') {
      sheetRef.current?.snapToIndex(0);
    } else if (lastResult.status === 'duplicate') {
      showToast('info', `${lastResult.itemName ?? 'Item'} already scanned`, 1500);
    }
  }, [lastResult]);

  const handleAddStock = useCallback(
    (itemId: string) => {
      router.push(`/(app)/(tabs)/inventory/${itemId}/receive` as any);
    },
    [router],
  );

  const handleDispense = useCallback(
    (itemId: string) => {
      router.push(`/(app)/(tabs)/inventory/${itemId}/dispense` as any);
    },
    [router],
  );

  const handleViewDetails = useCallback(
    (itemId: string) => {
      router.push(`/(app)/(tabs)/inventory/${itemId}` as any);
    },
    [router],
  );

  const handleCreateItem = useCallback(
    (barcode: string) => {
      router.push(`/(app)/(tabs)/inventory/add?prefilledBarcode=${encodeURIComponent(barcode)}` as any);
    },
    [router],
  );

  const handleManualSubmit = useCallback(
    (code: string) => {
      void onBarcodeScanned(code);
      setManualEntryVisible(false);
    },
    [onBarcodeScanned],
  );

  // expo-camera's CameraView fires this on every distinct barcode detection
  // (throttled to at most once per 500ms for the *same, repeated* barcode --
  // see this file's doc comment) -- feeds straight into the existing
  // useBarcodeScan hook's string-based onBarcodeScanned, unchanged.
  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.data) void onBarcodeScanned(result.data);
    },
    [onBarcodeScanned],
  );

  const handleMountError = useCallback((event: CameraMountError) => {
    setMountError(event.message);
  }, []);

  const staleMinutes = minutesAgo(lastSynced);
  const showStaleCache = staleMinutes !== null && staleMinutes > STALE_CACHE_MINUTES;

  // --- Fallback: camera hardware unavailable / failed to mount ---
  if (mountError) {
    return (
      <View style={styles.fallbackContainer} testID="no-camera-fallback">
        <MaterialCommunityIcons name="camera-off-outline" size={48} color={COLORS.onSurfaceVariant} />
        <Text variant="titleMedium" style={styles.fallbackHeading}>
          Camera not available
        </Text>
        <Text variant="bodyLarge" style={styles.fallbackBody}>
          Enter the barcode number below to look it up.
        </Text>
        <ManualBarcodeInput visible onSubmit={onBarcodeScanned} isLooking={isLooking} />
        {lastResult.status === 'not_found' && (
          <UnknownBarcodePrompt
            barcode={lastResult.code}
            isOffline={isOffline}
            onCreate={() => handleCreateItem(lastResult.code)}
            onRetry={dismissResult}
          />
        )}
        {lastResult.status === 'found' && mode === 'single' && (
          <ScanResultCard
            item={lastResult.item}
            onAddStock={handleAddStock}
            onDispense={handleDispense}
            onViewDetails={handleViewDetails}
          />
        )}
        {mode !== 'single' && scannedItems.length > 0 && (
          <ContinuousScanList
            items={scannedItems}
            mode={mode}
            actualCounts={actualCounts}
            onUpdateCount={setActualCount}
            onAddStock={handleAddStock}
            onDispense={handleDispense}
            onViewDetails={handleViewDetails}
          />
        )}
      </View>
    );
  }

  // --- Fallback: camera permission denied (or still resolving -- `permission`
  // is `null` until the initial async check completes) ---
  if (!permission || !permission.granted) {
    const canRequestPermission = permission ? permission.canAskAgain : true;
    return (
      <View style={styles.fallbackContainer} testID="permission-denied-fallback">
        <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.onSurfaceVariant} />
        <Text variant="titleMedium" style={styles.fallbackHeading}>
          Camera permission required
        </Text>
        <Text variant="bodyLarge" style={styles.fallbackBody}>
          Enable in device settings.
        </Text>
        {canRequestPermission ? (
          <BreeyoIconButton
            icon="camera"
            mode="filled"
            accessibilityLabel="Grant camera permission"
            onPress={() => void requestPermission()}
          />
        ) : (
          <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
            <Text variant="bodyLarge" style={styles.settingsLink}>
              Open Settings
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  const sheetContent =
    lastResult.status === 'not_found' ? (
      <UnknownBarcodePrompt
        barcode={lastResult.code}
        isOffline={isOffline}
        onCreate={() => handleCreateItem(lastResult.code)}
        onRetry={dismissResult}
        testID="unknown-barcode-prompt"
      />
    ) : mode === 'single' ? (
      lastResult.status === 'found' ? (
        <ScanResultCard
          item={lastResult.item}
          onAddStock={handleAddStock}
          onDispense={handleDispense}
          onViewDetails={handleViewDetails}
          testID="scan-result-card"
        />
      ) : null
    ) : (
      <ContinuousScanList
        items={scannedItems}
        mode={mode}
        actualCounts={actualCounts}
        onUpdateCount={setActualCount}
        onAddStock={handleAddStock}
        onDispense={handleDispense}
        onViewDetails={handleViewDetails}
        testID="continuous-scan-list"
      />
    );

  return (
    <GestureHandlerRootView style={styles.flex}>
      <View style={styles.container} testID="barcode-scanner-screen">
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: EXPO_CAMERA_BARCODE_TYPES }}
          onBarcodeScanned={handleBarcodeScanned}
          onMountError={handleMountError}
        />

        <ScanRegionOverlay pulseTrigger={pulseTrigger} />

        {isOffline && (
          <View style={styles.offlineBanner} testID="offline-banner">
            <MaterialCommunityIcons name="cloud-off-outline" size={16} color={COLORS.onTertiaryContainer} />
            <Text variant="bodySmall" style={styles.offlineBannerText}>
              Offline -- scanning from cached data
            </Text>
          </View>
        )}
        {pendingCount > 0 && (
          <View style={styles.pendingSyncBadge} testID="inventory-pending-sync-badge">
            <MaterialCommunityIcons name="cloud-sync-outline" size={14} color={COLORS.onTertiaryContainer} />
            <Text variant="bodySmall" style={styles.offlineBannerText}>
              {pendingCount} stock update{pendingCount === 1 ? '' : 's'} pending sync
            </Text>
          </View>
        )}
        {showStaleCache && (
          <Text variant="bodySmall" style={styles.staleCacheText}>
            Last synced: {staleMinutes} min ago
          </Text>
        )}

        <View style={styles.topRightControls}>
          <BreeyoIconButton
            icon={torchOn ? 'flash' : 'flash-off'}
            mode={torchOn ? 'filled' : 'standard'}
            accessibilityLabel="Toggle flash"
            onPress={() => {
              void Haptics.selectionAsync();
              setTorch(!torchOn);
            }}
            testID="torch-toggle"
          />
          <Text variant="bodySmall" style={styles.controlLabel}>
            Flash
          </Text>
        </View>

        <View style={styles.bottomControls}>
          {!manualEntryVisible && (
            <Pressable
              onPress={() => setManualEntryVisible(true)}
              style={styles.manualEntryTrigger}
              accessibilityRole="button"
              accessibilityLabel="Enter Barcode"
              testID="manual-entry-trigger"
            >
              <MaterialCommunityIcons name="keyboard-outline" size={20} color={COLORS.overlayText} />
              <Text variant="bodySmall" style={styles.manualEntryTriggerLabel}>
                Enter Barcode
              </Text>
            </Pressable>
          )}
          <ManualBarcodeInput
            visible={manualEntryVisible}
            onSubmit={handleManualSubmit}
            isLooking={isLooking}
            testID="manual-barcode-input"
          />
        </View>

        <ScanResultBottomSheet ref={sheetRef} onClose={dismissResult} testID="scan-result-bottom-sheet">
          {sheetContent}
        </ScanResultBottomSheet>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  fallbackHeading: {
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  fallbackBody: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 8,
  },
  settingsLink: {
    color: '#2E7D32',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  offlineBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.tertiaryContainer,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: COLORS.onTertiaryContainer,
    fontWeight: '500',
  },
  pendingSyncBadge: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.tertiaryContainer,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  staleCacheText: {
    position: 'absolute',
    top: 60,
    left: 16,
    color: COLORS.overlayText,
  },
  topRightControls: {
    position: 'absolute',
    top: 16,
    right: 16,
    alignItems: 'center',
  },
  controlLabel: {
    color: COLORS.overlayText,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 12,
  },
  manualEntryTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
  },
  manualEntryTriggerLabel: {
    color: COLORS.overlayText,
  },
});
