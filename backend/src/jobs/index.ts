import { pool } from '../config/database';
import { logger } from '../config/logger';
import { appointmentDedupe, notify } from '../services/notification.service';
import { formatIstHuman } from '../utils/time';
import { query } from '../config/database';

interface DueAppointment {
  id: string;
  appointment_number: string;
  starts_at: Date;
  patient_profile_id: string;
  patient_name: string;
  doctor_profile_id: string;
  doctor_name: string;
  doctor_id: string;
}

let timers: NodeJS.Timeout[] = [];
let running = false;

async function sendReminders(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await query<DueAppointment>(
      `select a.id, a.appointment_number, a.starts_at,
              pp.id as patient_profile_id, pp.full_name as patient_name,
              dp.id as doctor_profile_id, dp.full_name as doctor_name, d.id as doctor_id
         from appointments a
         join patients pt on pt.id = a.patient_id
         join profiles pp on pp.id = pt.profile_id
         join doctors d on d.id = a.doctor_id
         join profiles dp on dp.id = d.profile_id
        where a.status = 'confirmed'
          and a.starts_at between now() + interval '23 hours' and now() + interval '25 hours'`,
    );

    for (const row of due.rows) {
      const when = formatIstHuman(new Date(row.starts_at));
      await notify({
        profileId: row.patient_profile_id,
        appointmentId: row.id,
        type: 'appointment_reminder',
        title: 'Appointment reminder',
        body: `Your appointment ${row.appointment_number} with Dr. ${row.doctor_name} is scheduled for ${when}. Please arrive 10 minutes early.`,
        email: true,
        sms: true,
        dedupeKey: appointmentDedupe('appointment_reminder', row.id, row.patient_profile_id, String(row.starts_at)),
      });
      await notify({
        profileId: row.doctor_profile_id,
        appointmentId: row.id,
        type: 'appointment_reminder',
        title: 'Upcoming consultation',
        body: `You have a consultation with ${row.patient_name} on ${when} (${row.appointment_number}).`,
        email: true,
        dedupeKey: appointmentDedupe('appointment_reminder', row.id, row.doctor_profile_id, String(row.starts_at)),
      });
    }

    if (due.rows.length > 0) logger.info({ count: due.rows.length }, 'Appointment reminders dispatched');
  } catch (error) {
    logger.error({ err: error }, 'Reminder job failed');
  } finally {
    running = false;
  }
}

async function expireUnpaidBookings(): Promise<void> {
  try {
    const expired = await query<{ id: string; patient_profile_id: string; appointment_number: string }>(
      `with stale as (
         update appointments a
            set status = 'cancelled', cancellation_reason = 'Payment not completed in time',
                updated_at = now()
          where a.status = 'pending'
            and a.payment_status = 'pending'
            and a.created_at < now() - interval '30 minutes'
          returning a.id, a.appointment_number,
                    (select p.profile_id from patients p where p.id = a.patient_id) as patient_profile_id
       )
       select * from stale`,
    );

    for (const row of expired.rows) {
      await query(
        `insert into appointment_status_history (appointment_id, from_status, to_status, note)
         values ($1, 'pending', 'cancelled', 'Automatically cancelled: payment timeout')`,
        [row.id],
      );
      await notify({
        profileId: row.patient_profile_id,
        appointmentId: row.id,
        type: 'appointment_cancelled',
        title: 'Booking expired',
        body: `Your booking ${row.appointment_number} was cancelled because payment was not completed within 30 minutes. You can book a new slot anytime.`,
        email: true,
        dedupeKey: appointmentDedupe('appointment_expired', row.id, row.patient_profile_id),
      });
    }

    if (expired.rows.length > 0) logger.info({ count: expired.rows.length }, 'Expired unpaid bookings');
  } catch (error) {
    logger.error({ err: error }, 'Expiry job failed');
  }
}

export function startBackgroundJobs(): void {
  timers = [
    setInterval(() => void sendReminders(), 10 * 60 * 1000),
    setInterval(() => void expireUnpaidBookings(), 10 * 60 * 1000),
  ];
  timers.forEach((t) => t.unref());
  void sendReminders();
  void expireUnpaidBookings();
  logger.info('Background jobs started (reminders, unpaid booking expiry)');
}

export function stopBackgroundJobs(): void {
  timers.forEach((timer) => clearInterval(timer));
  timers = [];
}
