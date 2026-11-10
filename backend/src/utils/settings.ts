import { many } from '../config/database';
import { env } from '../config/env';

export interface PlatformSettings {
  booking_min_notice_minutes: number;
  booking_max_advance_days: number;
  cancellation_min_hours: number;
  reschedule_min_hours: number;
  pay_at_clinic_enabled: boolean;
  auto_confirm_appointments: boolean;
  clinic_name: string;
  support_email: string;
  support_phone: string;
  maintenance_mode: boolean;
  refund_processing_days: number;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  booking_min_notice_minutes: env.BOOKING_MIN_NOTICE_MINUTES,
  booking_max_advance_days: env.BOOKING_MAX_ADVANCE_DAYS,
  cancellation_min_hours: env.CANCELLATION_MIN_HOURS,
  reschedule_min_hours: env.RESCHEDULE_MIN_HOURS,
  pay_at_clinic_enabled: env.PAY_AT_CLINIC_ENABLED,
  auto_confirm_appointments: true,
  clinic_name: 'MediBook Health',
  support_email: 'support@medibook.in',
  support_phone: '+91 80 4000 1234',
  maintenance_mode: false,
  refund_processing_days: 5,
};

let cache: { value: PlatformSettings; expires: number } | null = null;

export async function getSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && cache.expires > Date.now()) return cache.value;

  const rows = await many<{ key: string; value: unknown }>('select key, value from platform_settings');
  const value = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in value) {
      (value as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  cache = { value, expires: Date.now() + 30_000 };
  return value;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
