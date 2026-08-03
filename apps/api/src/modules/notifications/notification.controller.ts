import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NotificationService } from './notification.service.js';
import {
  registerDeviceTokenSchema,
  removeDeviceTokenSchema,
  listNotificationsSchema,
  markReadSchema,
} from './notification.schema.js';

export function createNotificationController(service: NotificationService) {
  return {
    async registerDeviceTokenHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const { token, platform } = registerDeviceTokenSchema.body.parse(
        request.body,
      );
      const userId = request.user.id;

      const { deviceToken, created } = await service.registerDeviceToken(
        userId,
        token,
        platform,
      );

      return reply.status(created ? 201 : 200).send({ data: deviceToken });
    },

    async removeDeviceTokenHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const { token } = removeDeviceTokenSchema.body.parse(request.body);
      const userId = request.user.id;

      await service.removeDeviceToken(userId, token);

      return reply.status(200).send({ data: { success: true } });
    },

    async listNotificationsHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const query = listNotificationsSchema.querystring.parse(request.query);
      const userId = request.user.id;
      const clinicId = request.user.activeClinicId;

      const result = await service.list(userId, clinicId, {
        page: query.page,
        pageSize: query.pageSize,
        unreadOnly: query.unreadOnly,
      });

      return reply.status(200).send(result);
    },

    async getUnreadCountHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const userId = request.user.id;
      const clinicId = request.user.activeClinicId;

      const result = await service.getUnreadCount(userId, clinicId);

      return reply.status(200).send({ data: result });
    },

    async markReadHandler(request: FastifyRequest, reply: FastifyReply) {
      const { id } = markReadSchema.params.parse(request.params);
      const userId = request.user.id;

      const notification = await service.markRead(id, userId);

      if (!notification) {
        return reply.status(404).send({
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found',
          },
        });
      }

      return reply.status(200).send({ data: notification });
    },

    async markAllReadHandler(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.user.id;
      const clinicId = request.user.activeClinicId;

      const result = await service.markAllRead(userId, clinicId);

      return reply.status(200).send({ data: result });
    },
  };
}
