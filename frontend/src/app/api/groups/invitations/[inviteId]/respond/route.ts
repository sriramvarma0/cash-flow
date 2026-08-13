import { NextResponse } from 'next/server';
import { backendUrl, getAuthToken } from '../../../../../../lib/backend';

export async function POST(
  request: Request,
  context: { params: Promise<{ inviteId: string }> }
) {
  const token = await getAuthToken();
  const { inviteId } = await context.params;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/groups/invitations/${inviteId}/respond`, {
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
