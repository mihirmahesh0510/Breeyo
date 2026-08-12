// 1D barcode formats supported per D-15 (no QR codes for Beta)
export const BARCODE_FORMATS = [
  { value: 'ean13', label: 'EAN-13', visionCameraType: 'ean-13' },
  { value: 'ean8', label: 'EAN-8', visionCameraType: 'ean-8' },
  { value: 'upc_a', label: 'UPC-A', visionCameraType: 'upc-a' },
  { value: 'code128', label: 'Code 128', visionCameraType: 'code-128' },
  { value: 'code39', label: 'Code 39', visionCameraType: 'code-39' },
] as const;

export const BARCODE_FORMAT_VALUES = BARCODE_FORMATS.map((f) => f.value);
export const VISION_CAMERA_BARCODE_TYPES = BARCODE_FORMATS.map((f) => f.visionCameraType);
export type BarcodeFormatValue = (typeof BARCODE_FORMATS)[number]['value'];
