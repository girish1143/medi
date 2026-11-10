import { many, one } from '../config/database';
import { AuthUser } from '../types/express';
import { Errors } from '../utils/errors';
import { writeAudit } from './audit.service';

export async function createComplaint(
  actor: AuthUser,
  input: { subject: string; description: string; appointmentId?: string },
) {
  if (input.appointmentId) {
    const appointment = await one<{ id: string }>(
      'select id from appointments where id = $1 and patient_id = $2',
      [input.appointmentId, actor.patientId ?? null],
    );
    if (!appointment) throw Errors.forbidden('You can only reference your own appointments');
  }
  const row = await one<{ id: string }>(
    `insert into complaints (profile_id, appointment_id, subject, description)
     values ($1, $2, $3, $4) returning id`,
    [actor.id, input.appointmentId ?? null, input.subject, input.description],
  );
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'complaint.created',
    entityType: 'complaint',
    entityId: row?.id,
  });
  return { id: row?.id, status: 'open' };
}

export async function listMyComplaints(actor: AuthUser) {
  const rows = await many<{
    id: string;
    subject: string;
    description: string;
    status: string;
    resolution: string | null;
    created_at: Date;
  }>(
    `select id, subject, description, status::text, resolution, created_at
       from complaints where profile_id = $1 order by created_at desc limit 50`,
    [actor.id],
  );
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
  }));
}
