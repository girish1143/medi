import { Request, Response } from 'express';
import * as doctorService from '../services/doctor.service';
import * as dashboardService from '../services/dashboard.service';
import * as patientService from '../services/patient.service';
import { Errors } from '../utils/errors';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';

function requireDoctorId(req: Request): string {
  const doctorId = req.user?.doctorId;
  if (!doctorId) throw Errors.forbidden('Doctor profile not found');
  return doctorId;
}

export async function dashboard(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getDoctorDashboard(req.user!);
  sendSuccess(res, data, 'Doctor dashboard fetched');
}

export async function profile(req: Request, res: Response): Promise<void> {
  const data = await doctorService.getDoctorProfile(requireDoctorId(req));
  sendSuccess(res, data, 'Profile fetched');
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const data = await doctorService.updateDoctorOwnProfile(req.user!.id, req.body, req.user!.id);
  sendSuccess(res, data, 'Profile updated');
}

export async function schedule(req: Request, res: Response): Promise<void> {
  const data = await doctorService.getDoctorSchedule(requireDoctorId(req));
  sendSuccess(res, data, 'Schedule fetched');
}

export async function replaceAvailability(req: Request, res: Response): Promise<void> {
  const rows = await doctorService.replaceAvailability(
    requireDoctorId(req),
    req.body.slots,
    req.user!.id,
  );
  sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      slotMinutes: row.slot_minutes,
      breakStart: row.break_start?.slice(0, 5) ?? null,
      breakEnd: row.break_end?.slice(0, 5) ?? null,
      isActive: row.is_active,
    })),
    'Availability updated',
  );
}

export async function addTimeOff(req: Request, res: Response): Promise<void> {
  const data = await doctorService.addTimeOff(requireDoctorId(req), req.body, req.user!.id);
  sendSuccess(res, data, 'Time off added', 201);
}

export async function removeTimeOff(req: Request, res: Response): Promise<void> {
  await doctorService.removeTimeOff(requireDoctorId(req), req.params.timeOffId, req.user!.id);
  sendSuccess(res, null, 'Time off removed');
}

export async function listPatients(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await patientService.listDoctorPatients(requireDoctorId(req), {
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
