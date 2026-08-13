// 1D barcode formats supported per D-15 (no QR codes for Beta)
export const BARCODE_FORMATS = [
  { value: 'ean13', label: 'EAN-13' },
  { value: 'ean8', label: 'EAN-8' },
  { value: 'upc_a', label: 'UPC-A' },
  { value: 'code128', label: 'Code 128' },
  { value: 'code39', label: 'Code 39' },
] as const;

export const BARCODE_FORMAT_VALUES = BARCODE_FORMATS.map((f) => f.value);

/**
 * expo-camera's `CameraView` `barcodeScannerSettings.barcodeTypes` prop accepts
 * these exact string literals -- verified directly against the installed
 * expo-camera@16's `BarcodeType` union in `Camera.types.d.ts`:
 * 'aztec' | 'ean13' | 'ean8' | 'qr' | 'pdf417' | 'upc_e' | 'datamatrix' |
 * 'code39' | 'code93' | 'itf14' | 'codabar' | 'code128' | 'upc_a'.
 * They happen to be identical to `BARCODE_FORMATS[].value` already, so this
 * is just an explicit, intention-revealing alias for the scanner screen to
 * import (replaces the former `VISION_CAMERA_BARCODE_TYPES` after the
 * react-native-vision-camera -> expo-camera architecture fix -- see
 * .planning/phases/05-inventory-management/05-05-SUMMARY.md "Architecture Fix").
 */
export const EXPO_CAMERA_BARCODE_TYPES = BARCODE_FORMATS.map((f) => f.value);
export type BarcodeFormatValue = (typeof BARCODE_FORMATS)[number]['value'];
