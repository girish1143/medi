import { apiRequest } from '@/lib/api';
import type { PaymentOrder } from '@/types';

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>('script[data-medibook-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.medibookRazorpay = 'true';
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Pays a server-created order. In development simulation mode the backend
 * captures the payment directly; in Razorpay mode the checkout signature is
 * verified server-side before the appointment is confirmed.
 */
export async function payForOrder(order: PaymentOrder): Promise<void> {
  if (order.mode === 'dev') {
    await apiRequest('/payments/dev-confirm', { method: 'POST', body: { orderId: order.orderId } });
    return;
  }

  const loaded = await loadRazorpay();
  if (!loaded || !window.Razorpay) {
    throw new Error('Unable to load the secure payment window. Please try again.');
  }

  await new Promise<void>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'MediBook',
      description: order.description,
      order_id: order.orderId,
      prefill: order.prefill,
      theme: { color: '#1d4ed8' },
      handler: async (response: RazorpayPaymentResponse) => {
        try {
          await apiRequest('/payments/verify', {
            method: 'POST',
            body: {
              orderId: response.razorpay_order_id ?? order.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled. You can try again from your appointments.')),
      },
    });
    checkout.on('payment.failed', (response) => {
      reject(new Error(response.error?.description || 'Payment failed. Please try another method.'));
    });
    checkout.open();
  });
}
