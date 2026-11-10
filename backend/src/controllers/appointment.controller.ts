import { Request, Response } from 'express';
import * as appointmentService from '../services/appointment.service';
import * as paymentService from '../services/payment.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';
import { Errors } from '../utils/errors';

export async function createAppointment(req: Request, res: Response): Promise<void> {
  const result = await appointmentService.createBooking(req.body, req.user!);
  sendSuccess(res, result, 'Appointment booked', 201);
}

export async function listAppointments(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const statusParam = req.query.status as string | undefined;
  const allowed = ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'];
  const statuses = statusParam
    ? statusParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => allowed.includes(s))
    : undefined;

  const result = await appointmentService.listAppointmentsFor(req.user!, {
    statuses,
    view: (req.query.view as 'upcoming' | 'past' | 'today' | 'all' | undefined) ?? 'all',
    date: req.query.date as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    search: req.query.search as string | undefined,
    patientId: req.query.patientId as string | undefined,
    doctorId: req.query.doctorId as string | undefined,
    sort: req.query.sort as 'recent' | 'upcoming' | undefined,
    limit,
    offset: (page - 1) * limit,
  });

  sendSuccess(res, result.items, 'Appointments fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
    total: result.total,
  });
}

export async function getAppointment(req: Request, res: Response): Promise<void> {
  const appointment = await appointmentService.getAppointmentDetail(req.params.id, req.user!);
  sendSuccess(res, appointment, 'Appointment fetched');
}

export async function getAppointmentHistory(req: Request, res: Response): Promise<void> {
  const appointment = await appointmentService.getAppointmentDetail(req.params.id, req.user!);
  sendSuccess(res, appointment.history, 'Appointment history fetched');
}

export async function reschedule(req: Request, res: Response): Promise<void> {
  const updated = await appointmentService.rescheduleAppointment(
    req.params.id,
    req.body.startsAt,
    req.user!,
  );
  sendSuccess(res, updated, 'Appointment rescheduled');
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const result = await appointmentService.cancelAppointment(req.params.id, req.body.reason, req.user!);
  sendSuccess(res, result, 'Appointment cancelled');
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  if (req.body.status === 'cancelled') {
    const result = await appointmentService.cancelAppointment(
      req.params.id,
      req.body.note ?? 'Cancelled by staff',
      req.user!,
    );
    sendSuccess(res, result, 'Appointment cancelled');
    return;
  }
  const updated = await appointmentService.updateAppointmentStatus(
    req.params.id,
    req.body.status,
    req.body.note,
    req.user!,
  );
  sendSuccess(res, updated, 'Appointment status updated');
}

export async function submitReview(req: Request, res: Response): Promise<void> {
  const review = await appointmentService.submitReview(
    req.params.id,
    req.body.rating,
    req.body.comment,
    req.user!,
  );
  sendSuccess(res, review, 'Thank you for your feedback', 201);
}

export async function invoice(req: Request, res: Response): Promise<void> {
  const { buffer, fileName } = await appointmentService.getInvoicePdf(req.params.id, req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

export async function collectPayment(req: Request, res: Response): Promise<void> {
  if (!['admin', 'receptionist'].includes(req.user!.role)) throw Errors.forbidden();
  const result = await paymentService.collectPayAtClinic(req.params.id, req.user!);
  sendSuccess(res, result, 'Payment collected');
}
