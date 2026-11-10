import { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import * as dashboardService from '../services/dashboard.service';
import * as doctorService from '../services/doctor.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

export async function dashboard(_req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getAdminDashboard();
  sendSuccess(res, data, 'Admin dashboard fetched');
}

export async function analytics(_req: Request, res: Response): Promise<void> {
  const data = await adminService.analyticsOverview();
  sendSuccess(res, data, 'Analytics fetched');
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listUsers({
    role: req.query.role as string | undefined,
    search: req.query.search as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Users fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  const result = await adminService.updateUserRole(req.params.id, req.body.role, req.user!);
  sendSuccess(res, result, 'User role updated');
}

export async function listDoctors(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listDoctorsAdmin({
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Doctors fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function setDoctorVerification(req: Request, res: Response): Promise<void> {
  const result = await adminService.setDoctorVerification(
    req.params.id,
    req.body.status,
    req.body.note,
    req.user!,
  );
  sendSuccess(res, result, 'Doctor verification updated');
}

export async function createDoctor(req: Request, res: Response): Promise<void> {
  const result = await adminService.createDoctorAccount(req.body, req.user!);
  sendSuccess(res, result, 'Doctor account created and pending verification', 201);
}

export async function updateDoctor(req: Request, res: Response): Promise<void> {
  const result = await doctorService.updateDoctorAsAdmin(req.params.id, req.body, req.user!.id);
  sendSuccess(res, result, 'Doctor profile updated');
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listPaymentsAdmin({
    status: req.query.status as string | undefined,
    provider: req.query.provider as string | undefined,
    search: req.query.search as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Payments fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function listRefunds(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listRefundsAdmin(limit, (page - 1) * limit);
  sendSuccess(res, result.items, 'Refunds fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function getSettings(_req: Request, res: Response): Promise<void> {
  const data = await adminService.getPlatformSettings();
  sendSuccess(res, data, 'Settings fetched');
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const data = await adminService.updatePlatformSettings(req.body, req.user!);
  sendSuccess(res, data, 'Settings updated');
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listAuditLogs({
    action: req.query.action as string | undefined,
    entityType: req.query.entityType as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Audit logs fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function listComplaints(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listComplaints(limit, (page - 1) * limit);
  sendSuccess(res, result.items, 'Complaints fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function updateComplaint(req: Request, res: Response): Promise<void> {
  const result = await adminService.updateComplaint(req.params.id, req.body, req.user!);
  sendSuccess(res, result, 'Complaint updated');
}

export async function listReviews(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await adminService.listReviewsAdmin(limit, (page - 1) * limit);
  sendSuccess(res, result.items, 'Reviews fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function setReviewVisibility(req: Request, res: Response): Promise<void> {
  const result = await adminService.setReviewVisibility(req.params.id, req.body.isVisible, req.user!);
  sendSuccess(res, result, 'Review visibility updated');
}

export async function listSpecialtiesAdmin(_req: Request, res: Response): Promise<void> {
  const data = await adminService.listSpecialtiesAdmin();
  sendSuccess(res, data, 'Specialties fetched');
}

export async function createSpecialty(req: Request, res: Response): Promise<void> {
  const result = await adminService.createSpecialty(req.body, req.user!);
  sendSuccess(res, result, 'Specialty created', 201);
}

export async function updateSpecialty(req: Request, res: Response): Promise<void> {
  const result = await adminService.updateSpecialty(req.params.id, req.body, req.user!);
  sendSuccess(res, result, 'Specialty updated');
}

export async function listClinics(_req: Request, res: Response): Promise<void> {
  const data = await adminService.listClinics();
  sendSuccess(res, data, 'Clinics fetched');
}

export async function createClinic(req: Request, res: Response): Promise<void> {
  const result = await adminService.createClinic(req.body, req.user!);
  sendSuccess(res, result, 'Clinic created', 201);
}

export async function updateClinic(req: Request, res: Response): Promise<void> {
  const result = await adminService.updateClinic(req.params.id, req.body, req.user!);
  sendSuccess(res, result, 'Clinic updated');
}
