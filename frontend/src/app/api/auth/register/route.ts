import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl } from '@/lib/backend';

export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status });
  }

  const isSecure = request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https';
  const cookieStore = await cookies();
  cookieStore.set('cashflow_token', payload.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });

  return NextResponse.json(payload);
}
