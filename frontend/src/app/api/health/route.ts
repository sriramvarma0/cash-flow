import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  let backendStatus = 'unknown';
  let backendOk = false;

  try {
    const res = await fetch(`${backendUrl}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      backendStatus = data.status || 'ok';
      backendOk = true;
    } else {
      backendStatus = `error: status ${res.status}`;
    }
  } catch (err: any) {
    backendStatus = `unreachable: ${err?.message || 'connection failed'}`;
  }

  const overallOk = backendOk;
  return NextResponse.json(
    {
      status: overallOk ? 'ok' : 'degraded',
      frontend: 'ok',
      backend: backendStatus,
      timestamp: new Date().toISOString()
    },
    { status: overallOk ? 200 : 503 }
  );
}
