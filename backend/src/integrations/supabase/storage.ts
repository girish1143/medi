import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { getSupabaseAdmin } from './client';
import { signStorageToken } from '../../utils/crypto';

const ROOT = path.resolve(__dirname, '../../../', env.LOCAL_STORAGE_DIR);

export interface UploadInput {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  folder: string;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadFile(input: UploadInput, bucket = env.SUPABASE_MEDICAL_BUCKET): Promise<string> {
  const objectPath = `${safeSegment(input.folder)}/${Date.now()}-${safeSegment(input.fileName)}`;

  if (env.STORAGE_PROVIDER === 'supabase') {
    const { error } = await getSupabaseAdmin()
      .storage.from(bucket)
      .upload(objectPath, input.buffer, { contentType: input.contentType, upsert: false });
    if (error) throw new AppError(502, 'STORAGE_ERROR', `File upload failed: ${error.message}`);
    return objectPath;
  }

  const target = path.join(ROOT, bucket, objectPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, input.buffer);
  return objectPath;
}

export async function createSignedUrl(
  objectPath: string,
  bucket = env.SUPABASE_MEDICAL_BUCKET,
): Promise<{ url: string; expiresIn: number }> {
  if (env.STORAGE_PROVIDER === 'supabase') {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(bucket)
      .createSignedUrl(objectPath, env.SIGNED_URL_TTL_SECONDS);
    if (error || !data) throw new AppError(502, 'STORAGE_ERROR', 'Unable to create signed URL');
    return { url: data.signedUrl, expiresIn: env.SIGNED_URL_TTL_SECONDS };
  }

  const token = signStorageToken(`${bucket}/${objectPath}`);
  return {
    url: `/api/v1/files/${encodeURIComponent(bucket)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?token=${token}`,
    expiresIn: env.SIGNED_URL_TTL_SECONDS,
  };
}

export async function readLocalFile(bucket: string, objectPath: string): Promise<string> {
  if (bucket !== env.SUPABASE_MEDICAL_BUCKET && bucket !== env.SUPABASE_AVATAR_BUCKET) {
    throw new AppError(400, 'INVALID_BUCKET', 'Unknown storage bucket');
  }
  const target = path.resolve(ROOT, bucket, objectPath);
  const expected = path.resolve(ROOT, bucket);
  if (!target.startsWith(expected + path.sep)) {
    throw new AppError(400, 'INVALID_PATH', 'Invalid file path');
  }
  try {
    await fs.access(target);
  } catch {
    throw new AppError(404, 'NOT_FOUND', 'File not found');
  }
  return target;
}

export async function deleteFile(objectPath: string, bucket = env.SUPABASE_MEDICAL_BUCKET): Promise<void> {
  if (env.STORAGE_PROVIDER === 'supabase') {
    await getSupabaseAdmin().storage.from(bucket).remove([objectPath]);
    return;
  }
  try {
    await fs.unlink(path.join(ROOT, bucket, objectPath));
  } catch {
    // Ignore missing files during cleanup.
  }
}
