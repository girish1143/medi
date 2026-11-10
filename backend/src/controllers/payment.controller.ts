import { Request, Response } from 'express';
import * as paymentService from '../services/payment.service';
import * as appointmentService from '../services/appointment.service';
import { Errors } from '../utils/errors';
import { sendSuccess } from '../utils/http';

export async function createOrder(req: Request, res: Response): Promise<void> {
  const result = await paymentService.createOrderForAppointment(req.body.appointmentId, req.user!);
  sendSuccess(res, result, 'Payment order created', 201);
}

export async function verify(req: Request, res: Response): Promise<void> {
  const result = await paymentService.verifyPayment(
    { orderId: req.body.orderId, paymentId: req.body.paymentId, signature: req.body.signature },
    req.user!,
  );
  sendSuccess(res, result, 'Payment verified');
}

export async function devConfirm(req: Request, res: Response): Promise<void> {
  const result = await paymentService.devConfirmPayment({ orderId: req.body.orderId }, req.user!);
  sendSuccess(res, result, 'Payment captured (development simulation)');
}

export async function webhook(req: Request, res: Response): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  if (!rawBody) throw Errors.validation('Empty webhook payload');
  const signature = req.headers['x-razorpay-signature'];
  const result = await paymentService.handleWebhook(
    rawBody,
    typeof signature === 'string' ? signature : undefined,
  );
  sendSuccess(res, result, 'Webhook processed');
}

export async function refund(req: Request, res: Response): Promise<void> {
  const result = await paymentService.processRefund({
    paymentId: req.params.paymentId,
    amount: req.body.amount,
    reason: req.body.reason,
    actorId: req.user!.id,
  });
  sendSuccess(res, result, 'Refund processed');
}

export async function getForAppointment(req: Request, res: Response): Promise<void> {
  await appointmentService.getAppointmentDetail(req.params.appointmentId, req.user!);
  const payment = await paymentService.getAppointmentPayment(req.params.appointmentId);
  if (!payment) throw Errors.notFound('Payment');
  sendSuccess(res, payment, 'Payment fetched');
}
