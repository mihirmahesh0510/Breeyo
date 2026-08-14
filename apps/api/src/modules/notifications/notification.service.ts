import type { Notification, DeviceToken, Prisma } from '@prisma/client';
import type { DbClient } from '../../lib/prisma-rls.js';

export interface ListOptions {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * D-30: takes the `DbClient` union rather than `PrismaClient`.
 *
 * The four clinic-scoped handlers (`list`, `getUnreadCount`, `markRead`,
 * `markAllRead`) are constructed per request from `request.db`, so RLS applies.
 * The two device-token methods are reached from routes that deliberately omit
 * `tenantContext` and are therefore constructed from the admin client — see the
 * exemption comment in `notification.routes.ts`.
 */
export class NotificationService {
  constructor(private prisma: DbClient) {}

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string,
  ): Promise<{ deviceToken: DeviceToken; created: boolean }> {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { userId_token: { userId, token } },
    });

    if (existing) {
      // Update the updatedAt timestamp, return existing
      const updated = await this.prisma.deviceToken.update({
        where: { id: existing.id },
        data: { platform },
      });
      return { deviceToken: updated, created: false };
    }

    const deviceToken = await this.prisma.deviceToken.create({
      data: { userId, token, platform },
    });

    return { deviceToken, created: true };
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
  }

  async list(
    userId: string,
    clinicId: string,
    opts: ListOptions,
  ): Promise<PaginatedResult<Notification>> {
    const where: Record<string, unknown> = {
      recipientUserId: userId,
      clinicId,
    };

    if (opts.unreadOnly) {
      where.isRead = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: opts.page,
        pageSize: opts.pageSize,
        total,
        totalPages: Math.ceil(total / opts.pageSize) || 1,
      },
    };
  }

  async getUnreadCount(
    userId: string,
    clinicId: string,
  ): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        clinicId,
        isRead: false,
      },
    });

    return { count };
  }

  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification | null> {
    // Find the notification first to verify ownership
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
      },
    });

    if (!notification) {
      return null;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(
    userId: string,
    clinicId: string,
  ): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        clinicId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { count: result.count };
  }

  async create(data: {
    recipientUserId: string;
    clinicId: string;
    type: string;
    module: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        recipientUserId: data.recipientUserId,
        clinicId: data.clinicId,
        type: data.type,
        module: data.module,
        title: data.title,
        body: data.body,
        data: (data.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
