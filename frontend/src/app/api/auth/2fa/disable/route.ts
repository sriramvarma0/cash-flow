import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../../../lib/backend';

export async function POST(request: Request) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/auth/2fa/disable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: await request.text()
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
