import { Request, Response } from 'express';
import * as notificationService from '../services/notification.service';
import { Errors } from '../utils/errors';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await notificationService.listNotifications(req.user!.id, {
    unreadOnly: req.query.unread === 'true',
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Notifications fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
    unread: result.unread,
  });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const updated = await notificationService.markNotificationRead(req.user!.id, req.params.id);
  if (!updated) throw Errors.notFound('Notification');
  sendSuccess(res, { id: req.params.id, read: true }, 'Notification marked as read');
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const count = await notificationService.markAllNotificationsRead(req.user!.id);
  sendSuccess(res, { updated: count }, 'All notifications marked as read');
}
