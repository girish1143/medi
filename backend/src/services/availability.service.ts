import { many, one } from '../config/database';
import {
  addDaysToDateStr,
  addMinutes,
  formatIstTime,
  istToUtc,
  istToday,
  minutesToTime,
  timeToMinutes,
  weekdayOfDate,
} from '../utils/time';
import { Errors } from '../utils/errors';
import { getSettings } from '../utils/settings';

export interface AvailabilityRow {
  id: string;
  doctor_id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  break_start: string | null;
  break_end: string | null;
  is_active: boolean;
}

export interface Interval {
  starts_at: Date;
  ends_at: Date;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  time: string;
  label: string;
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function toLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function buildSlotsForDay(
  rows: AvailabilityRow[],
  dateStr: string,
  appointments: Interval[],
  timeOff: Interval[],
  minStart: Date,
  maxStart: Date,
): Slot[] {
  const slots = new Map<string, Slot>();

  for (const row of rows) {
    if (!row.is_active) continue;
    const startMinutes = timeToMinutes(normalizeTime(row.start_time) ?? '00:00');
    const endMinutes = timeToMinutes(normalizeTime(row.end_time) ?? '00:00');
    const breakStart = normalizeTime(row.break_start);
    const breakEnd = normalizeTime(row.break_end);
    const breakStartMin = breakStart ? timeToMinutes(breakStart) : null;
    const breakEndMin = breakEnd ? timeToMinutes(breakEnd) : null;
    const step = row.slot_minutes;

    for (let minute = startMinutes; minute + step <= endMinutes; minute += step) {
      if (breakStartMin !== null && breakEndMin !== null) {
        if (minute < breakEndMin && minute + step > breakStartMin) continue;
      }
      const localTime = minutesToTime(minute);
      const start = istToUtc(dateStr, localTime);
      const end = addMinutes(start, step);
      if (start < minStart || start > maxStart) continue;

      const overlapsAppointment = appointments.some(
        (a) => start < new Date(a.ends_at) && end > new Date(a.starts_at),
      );
      if (overlapsAppointment) continue;
      const overlapsTimeOff = timeOff.some(
        (t) => start < new Date(t.ends_at) && end > new Date(t.starts_at),
      );
      if (overlapsTimeOff) continue;

      const key = start.toISOString();
      if (!slots.has(key)) {
        slots.set(key, {
          startsAt: key,
          endsAt: end.toISOString(),
          time: localTime,
          label: toLabel(localTime),
        });
      }
    }
  }

  return [...slots.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function getSlotsForDate(doctorId: string, dateStr: string): Promise<Slot[]> {
  const settings = await getSettings();
  const today = istToday();
  if (dateStr < today) throw Errors.validation('Cannot view slots for a past date');
  const latest = addDaysToDateStr(today, settings.booking_max_advance_days);
  if (dateStr > latest) {
    throw Errors.validation(`Appointments can be booked up to ${settings.booking_max_advance_days} days ahead`);
  }

  const weekday = weekdayOfDate(dateStr);
  const rows = await many<AvailabilityRow>(
    `select id, doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end, is_active
       from doctor_availability where doctor_id = $1 and weekday = $2 and is_active = true
      order by start_time`,
    [doctorId, weekday],
  );
  if (!rows.length) return [];

  const dayStart = istToUtc(dateStr, '00:00');
  const dayEnd = istToUtc(addDaysToDateStr(dateStr, 1), '00:00');
  const appointments = await many<Interval>(
    `select starts_at, ends_at from appointments
      where doctor_id = $1 and status in ('pending','confirmed','checked_in','in_progress')
        and starts_at < $3 and ends_at > $2`,
    [doctorId, dayStart, dayEnd],
  );
  const timeOff = await many<Interval>(
    `select starts_at, ends_at from doctor_time_off
      where doctor_id = $1 and ends_at > $2 and starts_at < $3`,
    [doctorId, dayStart, dayEnd],
  );

  const now = new Date();
  const minStart = new Date(now.getTime() + settings.booking_min_notice_minutes * 60_000);
  const maxStart = addMinutes(now, settings.booking_max_advance_days * 24 * 60);
  return buildSlotsForDay(rows, dateStr, appointments, timeOff, minStart, maxStart);
}

export interface ResolvedSlot {
  startsAt: Date;
  endsAt: Date;
  dateStr: string;
  time: string;
  slotMinutes: number;
  weekday: number;
}

export async function resolveRequestedSlot(doctorId: string, startsAtIso: string): Promise<ResolvedSlot> {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw Errors.validation('Invalid appointment time');
  if (startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0) {
    throw Errors.slotUnavailable('Appointment times must align to a scheduled slot');
  }

  // Convert the requested UTC instant back to the IST wall clock.
  const ist = new Date(startsAt.getTime() + 330 * 60_000);
  const dateStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(
    ist.getUTCDate(),
  ).padStart(2, '0')}`;
  const time = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  const weekday = ist.getUTCDay();

  const rows = await many<AvailabilityRow>(
    `select id, doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end, is_active
       from doctor_availability where doctor_id = $1 and weekday = $2 and is_active = true`,
    [doctorId, weekday],
  );

  for (const row of rows) {
    const startMinutes = timeToMinutes(normalizeTime(row.start_time) ?? '00:00');
    const endMinutes = timeToMinutes(normalizeTime(row.end_time) ?? '00:00');
    const requested = timeToMinutes(time);
    const step = row.slot_minutes;
    if (requested < startMinutes || requested + step > endMinutes) continue;
    if ((requested - startMinutes) % step !== 0) continue;

    const breakStart = normalizeTime(row.break_start);
    const breakEnd = normalizeTime(row.break_end);
    if (breakStart && breakEnd) {
      const bStart = timeToMinutes(breakStart);
      const bEnd = timeToMinutes(breakEnd);
      if (requested < bEnd && requested + step > bStart) continue;
    }

    return {
      startsAt,
      endsAt: addMinutes(startsAt, step),
      dateStr,
      time,
      slotMinutes: step,
      weekday,
    };
  }

  throw Errors.slotUnavailable('This time does not match the doctor\'s consultation schedule');
}

/**
 * Efficiently computes the next free slot for many doctors at once. Used on
 * listing pages so each card can show "Next available".
 */
export async function getNextAvailableForDoctors(
  doctorIds: string[],
  horizonDays = 14,
): Promise<Map<string, Slot | null>> {
  const result = new Map<string, Slot | null>();
  if (!doctorIds.length) return result;

  const settings = await getSettings();
  const horizon = Math.min(horizonDays, settings.booking_max_advance_days);
  const today = istToday();
  const availability = await many<AvailabilityRow>(
    `select id, doctor_id, weekday, start_time, end_time, slot_minutes, break_start, break_end, is_active
       from doctor_availability where doctor_id = any($1::uuid[]) and is_active = true
      order by doctor_id, start_time`,
    [doctorIds],
  );
  const now = new Date();
  const windowEnd = addDaysToDateStr(today, horizon);
  const appointments = await many<{ doctor_id: string; starts_at: Date; ends_at: Date }>(
    `select doctor_id, starts_at, ends_at from appointments
      where doctor_id = any($1::uuid[]) and status in ('pending','confirmed','checked_in','in_progress')
        and starts_at >= now() - interval '1 day' and starts_at < $2::date + interval '1 day'`,
    [doctorIds, windowEnd],
  );
  const timeOff = await many<{ doctor_id: string; starts_at: Date; ends_at: Date }>(
    `select doctor_id, starts_at, ends_at from doctor_time_off
      where doctor_id = any($1::uuid[]) and ends_at > now()`,
    [doctorIds],
  );

  const byDoctor = new Map<string, AvailabilityRow[]>();
  for (const row of availability) {
    const list = byDoctor.get(row.doctor_id!) ?? [];
    list.push(row);
    byDoctor.set(row.doctor_id!, list);
  }

  const minStart = new Date(now.getTime() + settings.booking_min_notice_minutes * 60_000);
  const maxStart = addMinutes(now, settings.booking_max_advance_days * 24 * 60);

  for (const doctorId of doctorIds) {
    const rows = byDoctor.get(doctorId) ?? [];
    if (!rows.length) {
      result.set(doctorId, null);
      continue;
    }
    let found: Slot | null = null;
    for (let offset = 0; offset <= horizon; offset += 1) {
      const dateStr = addDaysToDateStr(today, offset);
      const weekday = weekdayOfDate(dateStr);
      const dayRows = rows.filter((r) => r.weekday === weekday);
      if (!dayRows.length) continue;
      const slots = buildSlotsForDay(
        dayRows,
        dateStr,
        appointments
          .filter((a) => a.doctor_id === doctorId)
          .map((a) => ({ starts_at: a.starts_at, ends_at: a.ends_at })),
        timeOff
          .filter((t) => t.doctor_id === doctorId)
          .map((t) => ({ starts_at: t.starts_at, ends_at: t.ends_at })),
        minStart,
        maxStart,
      );
      if (slots.length) {
        found = slots[0];
        break;
      }
    }
    result.set(doctorId, found);
  }

  return result;
}

export async function getNextAvailableSlot(doctorId: string): Promise<Slot | null> {
  const map = await getNextAvailableForDoctors([doctorId]);
  return map.get(doctorId) ?? null;
}

export async function assertSlotBookable(
  doctorId: string,
  resolved: ResolvedSlot,
  excludeAppointmentId?: string,
): Promise<void> {
  const settings = await getSettings();
  const now = new Date();
  if (resolved.startsAt <= now) throw Errors.slotUnavailable('Appointments cannot be booked in the past');
  if (resolved.startsAt.getTime() < now.getTime() + settings.booking_min_notice_minutes * 60_000) {
    throw Errors.validation(
      `Please book at least ${settings.booking_min_notice_minutes} minutes in advance`,
    );
  }
  if (resolved.startsAt.getTime() > now.getTime() + settings.booking_max_advance_days * 86_400_000) {
    throw Errors.validation(
      `Appointments can be booked up to ${settings.booking_max_advance_days} days ahead`,
    );
  }

  const conflict = await one<{ id: string }>(
    `select id from appointments
      where doctor_id = $1 and status in ('pending','confirmed','checked_in','in_progress')
        and starts_at < $3 and ends_at > $2
        and ($4::uuid is null or id <> $4)
      limit 1`,
    [doctorId, resolved.startsAt, resolved.endsAt, excludeAppointmentId ?? null],
  );
  if (conflict) throw Errors.slotUnavailable();

  const timeOff = await one<{ id: string }>(
    `select id from doctor_time_off
      where doctor_id = $1 and starts_at < $3 and ends_at > $2 limit 1`,
    [doctorId, resolved.startsAt, resolved.endsAt],
  );
  if (timeOff) throw Errors.slotUnavailable('The doctor is unavailable at this time');
}

export function slotToDto(slot: Slot) {
  return {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    time: slot.time,
    label: slot.label,
  };
}

export { formatIstTime };
