import { Request, Response } from 'express';
import * as recordService from '../services/medicalRecord.service';
import { getPagination, paginationMeta, sendSuccess } from '../utils/http';
import { Errors } from '../utils/errors';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit } = getPagination(req);
  const result = await recordService.listMedicalRecords(req.user!, {
    patientId: req.query.patientId as string | undefined,
    recordType: req.query.recordType as string | undefined,
    search: req.query.search as string | undefined,
    limit,
    offset: (page - 1) * limit,
  });
  sendSuccess(res, result.items, 'Medical records fetched', 200, {
    pagination: paginationMeta(page, limit, result.total),
  });
}

export async function upload(req: Request, res: Response): Promise<void> {
  if (!req.file) throw Errors.validation('Select a file to upload');
  const record = await recordService.uploadMedicalRecord(req.user!, req.file, req.body);
  sendSuccess(res, record, 'Medical record uploaded', 201);
}

export async function download(req: Request, res: Response): Promise<void> {
  const result = await recordService.getMedicalRecordDownload(req.params.id, req.user!);
  sendSuccess(res, result, 'Signed download URL generated');
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await recordService.deleteMedicalRecord(req.params.id, req.user!);
  sendSuccess(res, result, 'Medical record deleted');
}
