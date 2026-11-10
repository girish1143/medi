import { Request, Response } from 'express';
import * as supportService from '../services/support.service';
import { sendSuccess } from '../utils/http';

export async function create(req: Request, res: Response): Promise<void> {
  const result = await supportService.createComplaint(req.user!, req.body);
  sendSuccess(res, result, 'Support request submitted', 201);
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const items = await supportService.listMyComplaints(req.user!);
  sendSuccess(res, items, 'Support requests fetched');
}
