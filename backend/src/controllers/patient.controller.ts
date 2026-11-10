import { Request, Response } from 'express';
import * as patientService from '../services/patient.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

export async function getProfile(req: Request, res: Response): Promise<void> {
  const profile = await patientService.getPatientProfile(req.user!);
  sendSuccess(res, profile, 'Profile fetched');
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const profile = await patientService.updatePatientProfile(req.user!, req.body);
  sendSuccess(res, profile, 'Profile updated');
}

export async function dashboard(req: Request, res: Response): Promise<void> {
  const data = await patientService.getPatientDashboard(req.user!);
  sendSuccess(res, data, 'Dashboard fetched');
}

export async function listPatients(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await patientService.listPatients({
    search: req.query.search as string | undefined,
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
