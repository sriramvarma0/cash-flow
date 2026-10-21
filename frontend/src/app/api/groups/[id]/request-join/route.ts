import { NextRequest } from 'next/server';
import { handleBackendProxy } from '../../../../../lib/backend';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleBackendProxy(`/groups/${encodeURIComponent(id)}/request-join`, {
    method: 'POST'
  });
}
