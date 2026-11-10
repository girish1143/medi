import { one, many, query } from '../config/database';
import { logger } from '../config/logger';
import { idempotencyKey } from '../utils/crypto';
import { sendEmail, emailLayout } from '../integrations/email';
import { sendSms } from '../integrations/sms';

export interface NotifyInput {
  profileId: string;
  appointmentId?: string | null;
  type: string;
  title: string;
  body: string;
  email?: boolean;
  sms?: boolean;
  dedupeKey: string;
}

interface ContactRow {
  email: string;
  phone: string | null;
  full_name: string;
}

async function insertChannel(
  profileId: string,
  appointmentId: string | null,
  type: string,
  title: string,
  body: string,
  channel: 'in_app' | 'email' | 'sms',
  key: string,
): Promise<boolean> {
  const row = await one<{ id: string }>(
    `insert into notifications (profile_id, appointment_id, title, body, type, channel, status, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (idempotency_key) do nothing
     returning id`,
    [profileId, appointmentId, title, body, type, channel, channel === 'in_app' ? 'sent' : 'queued', key],
  );
  return Boolean(row);
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const contact = await one<ContactRow>('select email, phone, full_name from profiles where id = $1', [
      input.profileId,
    ]);
    if (!contact) return;

    await insertChannel(
      input.profileId,
      input.appointmentId ?? null,
      input.type,
      input.title,
      input.body,
      'in_app',
      `${input.dedupeKey}:in_app`,
    );

    if (input.email) {
      const key = `${input.dedupeKey}:email`;
      const inserted = await insertChannel(
        input.profileId,
        input.appointmentId ?? null,
        input.type,
        input.title,
        input.body,
        'email',
        key,
      );
      if (inserted) {
        const result = await sendEmail({
          to: contact.email,
          subject: input.title,
          html: emailLayout(input.title, `<p>Hi ${contact.full_name},</p><p>${input.body}</p>`),
          text: input.body,
        });
        await query(
          `update notifications set status = $1 where idempotency_key = $2`,
          [result.ok ? 'sent' : 'failed', key],
        );
      }
    }

    if (input.sms && contact.phone) {
      const key = `${input.dedupeKey}:sms`;
      const inserted = await insertChannel(
        input.profileId,
        input.appointmentId ?? null,
        input.type,
        input.title,
        input.body,
        'sms',
        key,
      );
      if (inserted) {
        const result = await sendSms(contact.phone, `${input.title}: ${input.body}`);
        await query(
          `update notifications set status = $1 where idempotency_key = $2`,
          [result.ok ? 'sent' : 'failed', key],
        );
      }
    }
  } catch (error) {
    logger.error({ err: error, type: input.type }, 'Notification dispatch failed');
  }
}

export function appointmentDedupe(type: string, appointmentId: string, profileId: string, extra = ''): string {
  return idempotencyKey([type, appointmentId, profileId, extra]);
}

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  type: string;
  channel: string;
  createdAt: Date;
  readAt: Date | null;
  appointmentId: string | null;
}

export async function listNotifications(
  profileId: string,
  input: { unreadOnly?: boolean; limit: number; offset: number },
): Promise<{ items: NotificationDto[]; total: number; unread: number }> {
  const rows = await many<{
    id: string;
    title: string;
    body: string;
    type: string;
    channel: string;
    created_at: Date;
    read_at: Date | null;
    appointment_id: string | null;
  }>(
    `select id, title, body, type, channel::text, created_at, read_at, appointment_id
       from notifications
      where profile_id = $1 and channel = 'in_app' ${input.unreadOnly ? 'and read_at is null' : ''}
      order by created_at desc limit $2 offset $3`,
    [profileId, input.limit, input.offset],
  );
  const totalRow = await one<{ count: string }>(
    `select count(*)::text as count from notifications
      where profile_id = $1 and channel = 'in_app' ${input.unreadOnly ? 'and read_at is null' : ''}`,
    [profileId],
  );
  const unreadRow = await one<{ count: string }>(
    `select count(*)::text as count from notifications
      where profile_id = $1 and channel = 'in_app' and read_at is null`,
    [profileId],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      channel: row.channel,
      createdAt: row.created_at,
      readAt: row.read_at,
      appointmentId: row.appointment_id,
    })),
    total: Number(totalRow?.count ?? 0),
    unread: Number(unreadRow?.count ?? 0),
  };
}

export async function markNotificationRead(profileId: string, id: string): Promise<boolean> {
  const row = await one<{ id: string }>(
    `update notifications set read_at = coalesce(read_at, now()), status = 'read'
      where id = $1 and profile_id = $2 and channel = 'in_app' returning id`,
    [id, profileId],
  );
  return Boolean(row);
}

export async function markAllNotificationsRead(profileId: string): Promise<number> {
  const result = await query(
    `update notifications set read_at = now(), status = 'read'
      where profile_id = $1 and channel = 'in_app' and read_at is null`,
    [profileId],
  );
  return result.rowCount ?? 0;
}
