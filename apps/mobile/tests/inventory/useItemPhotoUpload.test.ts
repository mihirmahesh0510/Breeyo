import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module under test imports `react-native` (Platform/ActionSheetIOS/Alert)
// and `expo-image-picker` for the picker UI, neither of which this vitest
// "node" environment can actually transform (their real sources use Flow
// syntax RN's own Jest preset handles but Vite's esbuild/rollup pipeline
// does not -- confirmed: no existing test in this repo imports the real
// `react-native` package for the same reason). Stub both so only the
// pure `uploadPickedPhotoToPresignedUrl` function under test needs to load.
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
  Alert: { alert: vi.fn() },
}));
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
// `useAuth` (via AuthProvider -> lib/auth-storage) transitively imports
// expo-secure-store, which -- like expo-image-picker -- reaches into real
// native modules. Same reasoning as tests/auth/auth-flow.test.tsx.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

// Mock expo-file-system's uploadAsync before importing the module under test.
vi.mock('expo-file-system', () => ({
  uploadAsync: vi.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
}));

// Mock the shared apiClient used to request the presigned URL.
const mockApiClient = vi.fn();
vi.mock('../../src/lib/api', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import * as FileSystem from 'expo-file-system';
import { uploadPickedPhotoToPresignedUrl } from '../../src/features/inventory/hooks/useItemPhotoUpload';

// Note: only the extracted pure orchestration function is tested directly.
// The `useItemPhotoUpload` hook itself (useState/picker/action-sheet
// plumbing) is not rendered here -- this repo's react-test-renderer version
// is incompatible with the installed react-native/react pairing in the
// vitest "node" environment (see useInventorySearch.test.ts for the same
// note). Pulling the request-presigned-url -> PUT-to-S3 sequence into a
// plain async function keeps that logic unit-testable without a renderer.

describe('uploadPickedPhotoToPresignedUrl', () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    (FileSystem.uploadAsync as ReturnType<typeof vi.fn>).mockReset();
  });

  it('requests a presigned URL scoped to the item, then PUTs the asset to it', async () => {
    mockApiClient.mockResolvedValue({
      data: { uploadUrl: 'https://s3.example.com/upload', photoUrl: 'https://s3.example.com/final.jpg', expiresIn: 900 },
    });
    (FileSystem.uploadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const result = await uploadPickedPhotoToPresignedUrl(
      'item-123',
      { uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg' },
      'token-abc',
    );

    expect(mockApiClient).toHaveBeenCalledWith(
      '/api/v1/inventory/items/item-123/photo-upload-url',
      expect.objectContaining({ method: 'POST', token: 'token-abc' }),
    );
    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
      'https://s3.example.com/upload',
      'file:///tmp/photo.jpg',
      expect.objectContaining({ httpMethod: 'PUT' }),
    );
    expect(result).toBe('https://s3.example.com/final.jpg');
  });

  it('defaults to image/jpeg when the asset has no mimeType', async () => {
    mockApiClient.mockResolvedValue({
      data: { uploadUrl: 'https://s3.example.com/upload', photoUrl: 'https://s3.example.com/final.jpg', expiresIn: 900 },
    });
    (FileSystem.uploadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    await uploadPickedPhotoToPresignedUrl('item-123', { uri: 'file:///tmp/photo.jpg' }, 'token-abc');

    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ headers: { 'Content-Type': 'image/jpeg' } }),
    );
  });

  it('reports progress milestones as the upload proceeds', async () => {
    mockApiClient.mockResolvedValue({
      data: { uploadUrl: 'https://s3.example.com/upload', photoUrl: 'https://s3.example.com/final.jpg', expiresIn: 900 },
    });
    (FileSystem.uploadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const progressUpdates: number[] = [];
    await uploadPickedPhotoToPresignedUrl(
      'item-123',
      { uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg' },
      'token-abc',
      (p) => progressUpdates.push(p),
    );

    expect(progressUpdates).toEqual([0.1, 0.3, 1.0]);
  });

  it('throws when the S3 PUT returns a non-2xx status', async () => {
    mockApiClient.mockResolvedValue({
      data: { uploadUrl: 'https://s3.example.com/upload', photoUrl: 'https://s3.example.com/final.jpg', expiresIn: 900 },
    });
    (FileSystem.uploadAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 500 });

    await expect(
      uploadPickedPhotoToPresignedUrl('item-123', { uri: 'file:///tmp/photo.jpg' }, 'token-abc'),
    ).rejects.toThrow('Photo upload failed with status 500');
  });

  it('propagates a failure requesting the presigned URL without attempting the upload', async () => {
    mockApiClient.mockRejectedValue(new Error('Inventory item not found'));

    await expect(
      uploadPickedPhotoToPresignedUrl('missing-item', { uri: 'file:///tmp/photo.jpg' }, 'token-abc'),
    ).rejects.toThrow('Inventory item not found');

    expect(FileSystem.uploadAsync).not.toHaveBeenCalled();
  });
});
