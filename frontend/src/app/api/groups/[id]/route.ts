import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../../lib/backend';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const token = await getAuthToken();
  const { id } = await context.params;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/groups/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
