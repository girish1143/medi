import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  if (env.EMAIL_PROVIDER === 'console') {
    logger.info({ to: message.to, subject: message.subject }, '[email] delivery simulated (console provider)');
    return { ok: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Email provider responded ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, 'Email delivery failed');
    return { ok: false, error: 'Email delivery failed' };
  }
}

export function emailLayout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="background:#0b5fff;padding:24px 32px;color:#ffffff;font-size:20px;font-weight:700">MediBook</td></tr>
      <tr><td style="padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
        <div style="font-size:14px;line-height:1.7;color:#334155">${body}</div>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f8fafc;color:#94a3b8;font-size:12px">
        MediBook Health · Bengaluru, India · support@medibook.in
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
