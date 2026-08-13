import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../../lib/backend';

async function forward(request: Request, method: 'PATCH' | 'DELETE', id: string) {
  const token = await getAuthToken();

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/expenses/${id}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: method === 'PATCH' ? await request.text() : undefined
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return forward(request, 'PATCH', id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return forward(request, 'DELETE', id);
}
