import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import * as patientService from '../services/patient.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

export async function dashboard(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getReceptionDashboard(req.user!);
  sendSuccess(res, data, 'Reception dashboard fetched');
}

export async function registerWalkIn(req: Request, res: Response): Promise<void> {
  const result = await patientService.registerWalkInPatient(req.body, req.user!);
  sendSuccess(res, result, result.existed ? 'Patient already registered' : 'Patient registered', result.existed ? 200 : 201);
}

export async function listPatients(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await patientService.listPatients({
    search: req.query.search as string | undefined,
    id: req.query.id as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Patients fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function getPatient(req: Request, res: Response): Promise<void> {
  const data = await patientService.getPatientClinicalView(req.params.id, req.user!);
  sendSuccess(res, data, 'Patient fetched');
}
