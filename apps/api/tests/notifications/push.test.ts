import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expo-server-sdk before importing PushService
vi.mock('expo-server-sdk', () => {
  const Expo = vi.fn().mockImplementation(() => ({
    chunkPushNotifications: vi.fn(),
    sendPushNotificationsAsync: vi.fn(),
  }));
  (Expo as any).isExpoPushToken = vi.fn();
  return { default: Expo, Expo };
});

import { PushService } from '../../src/modules/notifications/push.service.js';
import Expo from 'expo-server-sdk';

describe('PushService', () => {
  let pushService: PushService;
  let mockExpoInstance: {
    chunkPushNotifications: ReturnType<typeof vi.fn>;
    sendPushNotificationsAsync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pushService = new PushService();

    // Access the mock instance created by the constructor
    mockExpoInstance = (Expo as unknown as ReturnType<typeof vi.fn>).mock
      .results[0].value;
  });

  it('should call Expo API with correct payload', async () => {
    const tokens = ['ExponentPushToken[abc123]', 'ExponentPushToken[def456]'];
    (Expo.isExpoPushToken as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const messages = tokens.map((token) => ({
      to: token,
      title: 'Test Title',
      body: 'Test Body',
      data: { key: 'value' },
      sound: 'default' as const,
    }));

    mockExpoInstance.chunkPushNotifications.mockReturnValue([messages]);
    mockExpoInstance.sendPushNotificationsAsync.mockResolvedValue(
      tokens.map(() => ({ status: 'ok' })),
    );

    const result = await pushService.send(tokens, 'Test Title', 'Test Body', {
      key: 'value',
    });

    expect(mockExpoInstance.chunkPushNotifications).toHaveBeenCalledWith(
      messages,
    );
    expect(mockExpoInstance.sendPushNotificationsAsync).toHaveBeenCalledWith(
      messages,
    );
    expect(result.sent).toBe(2);
    expect(result.invalidTokens).toHaveLength(0);
  });

  it('should filter out invalid tokens before sending', async () => {
    const tokens = ['ExponentPushToken[valid]', 'invalid-token', 'also-bad'];
    (Expo.isExpoPushToken as ReturnType<typeof vi.fn>).mockImplementation(
      (token: string) => token.startsWith('ExponentPushToken['),
    );

    const validMessages = [
      {
        to: 'ExponentPushToken[valid]',
        title: 'Title',
        body: 'Body',
        data: undefined,
        sound: 'default' as const,
      },
    ];

    mockExpoInstance.chunkPushNotifications.mockReturnValue([validMessages]);
    mockExpoInstance.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok' },
    ]);

    const result = await pushService.send(tokens, 'Title', 'Body');

    // Should only send valid tokens
    expect(mockExpoInstance.chunkPushNotifications).toHaveBeenCalledWith(
      validMessages,
    );
    expect(result.sent).toBe(1);
  });

  it('should return invalidTokens for DeviceNotRegistered errors', async () => {
    const tokens = ['ExponentPushToken[good]', 'ExponentPushToken[bad]'];
    (Expo.isExpoPushToken as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const messages = tokens.map((token) => ({
      to: token,
      title: 'Title',
      body: 'Body',
      data: undefined,
      sound: 'default' as const,
    }));

    mockExpoInstance.chunkPushNotifications.mockReturnValue([messages]);
    mockExpoInstance.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok' },
      {
        status: 'error',
        message: 'Device not registered',
        details: { error: 'DeviceNotRegistered' },
      },
    ]);

    const result = await pushService.send(tokens, 'Title', 'Body');

    expect(result.sent).toBe(1);
    expect(result.invalidTokens).toEqual(['ExponentPushToken[bad]']);
  });

  it('should handle empty token array gracefully', async () => {
    const result = await pushService.send([], 'Title', 'Body');

    expect(result.sent).toBe(0);
    expect(result.invalidTokens).toHaveLength(0);
    expect(
      mockExpoInstance.chunkPushNotifications,
    ).not.toHaveBeenCalled();
    expect(
      mockExpoInstance.sendPushNotificationsAsync,
    ).not.toHaveBeenCalled();
  });
});
