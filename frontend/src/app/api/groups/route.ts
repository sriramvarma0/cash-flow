import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../lib/backend';

async function forwardRequest(request: Request, method: 'GET' | 'POST') {
  const token = await getAuthToken();

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/groups`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: method === 'POST' ? await request.text() : undefined
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: Request) {
  return forwardRequest(request, 'GET');
}

export async function POST(request: Request) {
  return forwardRequest(request, 'POST');
}
