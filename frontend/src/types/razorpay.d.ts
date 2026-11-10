declare global {
  interface RazorpayPaymentResponse {
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }

  interface RazorpayFailureResponse {
    error?: { description?: string; code?: string; reason?: string };
  }

  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}

export {};
