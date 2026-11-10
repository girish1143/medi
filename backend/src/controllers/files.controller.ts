import { Request, Response } from 'express';
import { env } from '../config/env';
import { readLocalFile } from '../integrations/supabase/storage';
import { verifyStorageToken } from '../utils/crypto';
import { Errors } from '../utils/errors';

export async function serveLocalFile(req: Request, res: Response): Promise<void> {
  if (env.STORAGE_PROVIDER !== 'local') throw Errors.notFound('File');

  const bucket = String(req.params.bucket ?? '');
  const objectPath = String((req.params as Record<string, string>)[0] ?? '');
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  if (!bucket || !objectPath || !token) {
    throw Errors.forbidden('A valid signed download link is required');
  }
  if (!verifyStorageToken(`${bucket}/${objectPath}`, token)) {
    throw Errors.forbidden('This download link is invalid or has expired');
  }

  const filePath = await readLocalFile(bucket, objectPath);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
}
