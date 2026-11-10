import { env } from '../../config/env';
import { logger } from '../../config/logger';

export async function sendSms(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!phone) return { ok: false, error: 'Missing phone number' };

  if (env.SMS_PROVIDER === 'console') {
    logger.info({ phone: phone.replace(/\d(?=\d{4})/g, '*'), length: message.length }, '[sms] delivery simulated (console provider)');
    return { ok: true };
  }

  try {
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: env.SMS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: env.SMS_API_KEY,
        recipients: [{ mobiles: `91${phone.replace(/\D/g, '').slice(-10)}`, message }],
      }),
    });
    return response.ok ? { ok: true } : { ok: false, error: `SMS provider responded ${response.status}` };
  } catch (error) {
    logger.error({ err: error }, 'SMS delivery failed');
    return { ok: false, error: 'SMS delivery failed' };
  }
}
