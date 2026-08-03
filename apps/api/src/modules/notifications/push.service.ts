import Expo, {
  type ExpoPushMessage,
  type ExpoPushTicket,
} from 'expo-server-sdk';

export interface PushResult {
  sent: number;
  invalidTokens: string[];
}

export class PushService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo();
  }

  async send(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<PushResult> {
    if (tokens.length === 0) {
      return { sent: 0, invalidTokens: [] };
    }

    // Filter to valid Expo push tokens only
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));

    if (validTokens.length === 0) {
      return { sent: 0, invalidTokens: [] };
    }

    // Build messages
    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
    }));

    // Chunk messages per Expo API limits
    const chunks = this.expo.chunkPushNotifications(messages);
    const invalidTokens: string[] = [];
    let sent = 0;

    for (const chunk of chunks) {
      const tickets: ExpoPushTicket[] =
        await this.expo.sendPushNotificationsAsync(chunk);

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'ok') {
          sent++;
        } else if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        ) {
          // The token at position i in this chunk is invalid
          const message = chunk[i];
          const tokenStr =
            typeof message.to === 'string' ? message.to : message.to[0];
          invalidTokens.push(tokenStr);
        }
      }
    }

    return { sent, invalidTokens };
  }
}
