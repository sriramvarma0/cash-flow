import { NextRequest } from 'next/server';
import { handleBackendProxy } from '../../../../../../lib/backend';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const body = await req.json();
  return handleBackendProxy(`/groups/join-requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'POST',
    body
  });
}
