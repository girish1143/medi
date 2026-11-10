import { NextResponse } from 'next/server';
import { verifyDatabaseConnectivity } from '@/lib/db/prisma';

export async function GET() {
  try {
    const connected = await verifyDatabaseConnectivity();
    return NextResponse.json(
      {
        success: true,
        data: {
          status: 'ok',
          database: connected ? 'connected' : 'unavailable',
          timestamp: new Date().toISOString(),
        },
      },
      { status: connected ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database connectivity check failed.',
        },
      },
      { status: 503 },
    );
  }
}
