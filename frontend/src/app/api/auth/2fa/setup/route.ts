import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../../../lib/backend';

export async function GET() {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/auth/2fa/setup`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
