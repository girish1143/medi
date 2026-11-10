import { Request, Response } from 'express';
import * as prescriptionService from '../services/prescription.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await prescriptionService.listPrescriptionsFor(req.user!, {
    patientId: req.query.patientId as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Prescriptions fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function get(req: Request, res: Response): Promise<void> {
  const prescription = await prescriptionService.getPrescription(req.params.id, req.user!);
  sendSuccess(res, prescription, 'Prescription fetched');
}

export async function create(req: Request, res: Response): Promise<void> {
  const prescription = await prescriptionService.createPrescription(req.body, req.user!);
  sendSuccess(res, prescription, 'Prescription created', 201);
}

export async function pdf(req: Request, res: Response): Promise<void> {
  const { buffer, fileName } = await prescriptionService.getPrescriptionPdf(req.params.id, req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}
