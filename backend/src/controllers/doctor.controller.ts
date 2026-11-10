import { Request, Response } from 'express';
import * as doctorService from '../services/doctor.service';
import * as availabilityService from '../services/availability.service';
import * as doctorRepo from '../repositories/doctor.repo';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';
import { Errors } from '../utils/errors';
import { getSlotsForDate } from '../services/availability.service';

export async function listDoctors(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as { page: number; limit: number };
  const { page, limit } = getPagination(req);
  const filters: doctorRepo.DoctorFilters = {
    q: req.query.q as string | undefined,
    specialty: req.query.specialty as string | undefined,
    city: req.query.city as string | undefined,
    area: req.query.area as string | undefined,
    minFee: req.query.minFee ? Number(req.query.minFee) : undefined,
    maxFee: req.query.maxFee ? Number(req.query.maxFee) : undefined,
    minExperience: req.query.minExperience ? Number(req.query.minExperience) : undefined,
    minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
    availableToday: req.query.availableToday === 'true',
    consultationType: req.query.consultationType as 'in_clinic' | 'online' | undefined,
    sort: req.query.sort as string | undefined,
    limit,
    offset: (page - 1) * limit,
  };
  const { items, total } = await doctorService.searchDoctors(filters);
  sendSuccess(res, items, 'Doctors fetched', 200, { pagination: paginationMeta(page, limit, total) });
}

export async function getDoctor(req: Request, res: Response): Promise<void> {
  const doctor = await doctorService.getDoctorProfile(req.params.id);
  sendSuccess(res, doctor, 'Doctor profile fetched');
}

export async function getDoctorSlots(req: Request, res: Response): Promise<void> {
  const date = String(req.query.date);
  const doctor = await doctorRepo.findDoctorDetail(req.params.id);
  if (!doctor || !doctor.is_active || doctor.verification_status !== 'verified') {
    throw Errors.notFound('Doctor');
  }
  const slots = await getSlotsForDate(req.params.id, date);
  sendSuccess(res, { date, timezone: 'Asia/Kolkata', slots }, 'Slots fetched');
}

export async function getDoctorReviews(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const { rows, total, distribution } = await doctorRepo.getDoctorReviews(
    req.params.id,
    limit,
    (page - 1) * limit,
  );
  sendSuccess(
    res,
    {
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        patientName: row.patient_name,
        appointmentNumber: row.appointment_number,
        createdAt: row.created_at,
      })),
      distribution,
    },
    'Reviews fetched',
    200,
    { pagination: paginationMeta(page, limit, total) },
  );
}

export async function listSpecialties(_req: Request, res: Response): Promise<void> {
  const rows = await doctorService.getSpecialties();
  sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      doctorCount: row.doctor_count,
    })),
    'Specialties fetched',
  );
}

export async function getSpecialty(req: Request, res: Response): Promise<void> {
  const specialty = await doctorService.getSpecialtyBySlug(req.params.slug);
  if (!specialty) throw Errors.notFound('Specialty');
  const { items, total } = await doctorService.searchDoctors({
    specialty: specialty.slug,
    limit: 100,
    offset: 0,
  });
  sendSuccess(res, { specialty, doctors: items, total }, 'Specialty fetched');
}

export async function getDoctorWorkingHours(req: Request, res: Response): Promise<void> {
  const rows = await doctorRepo.listDoctorAvailability(req.params.id);
  sendSuccess(
    res,
    rows.map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      slotMinutes: row.slot_minutes,
      breakStart: row.break_start?.slice(0, 5) ?? null,
      breakEnd: row.break_end?.slice(0, 5) ?? null,
      isActive: row.is_active,
    })),
    'Working hours fetched',
  );
}

export async function createDoctor(req: Request, res: Response): Promise<void> {
  const created = await (await import('../services/admin.service')).createDoctorAccount(req.body, req.user!);
  sendSuccess(res, created, 'Doctor account created and pending verification', 201);
}

export async function updateDoctor(req: Request, res: Response): Promise<void> {
  const updated = await doctorService.updateDoctorAsAdmin(req.params.id, req.body, req.user!.id);
  sendSuccess(res, updated, 'Doctor profile updated');
}

export { availabilityService };
