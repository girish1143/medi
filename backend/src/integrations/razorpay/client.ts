import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { safeEqual, hmacSha256 } from '../../utils/crypto';
import { logger } from '../../config/logger';

const BASE = 'https://api.razorpay.com/v1';

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(500, 'PAYMENT_NOT_CONFIGURED', 'Razorpay is not configured');
  }
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    logger.error({ status: response.status, body }, 'Razorpay API error');
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider request failed');
  }
  return body as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return request<RazorpayOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: env.RAZORPAY_CURRENCY,
      receipt: input.receipt,
      notes: input.notes,
      payment_capture: 1,
    }),
  });
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function createRefund(input: {
  paymentId: string;
  amountPaise?: number;
  notes: Record<string, string>;
}): Promise<RazorpayRefund> {
  return request<RazorpayRefund>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
    method: 'POST',
    body: JSON.stringify({
      ...(input.amountPaise ? { amount: input.amountPaise } : {}),
      notes: input.notes,
      speed: 'normal',
    }),
  });
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = hmacSha256(`${orderId}|${paymentId}`, env.RAZORPAY_KEY_SECRET);
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = hmacSha256(rawBody, env.RAZORPAY_WEBHOOK_SECRET);
  return safeEqual(expected, signature);
}
