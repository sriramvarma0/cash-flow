import { handleBackendProxy } from '../../../../../lib/backend';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  return handleBackendProxy(`/investments/${encodeURIComponent(code)}/transactions`, { method: 'GET' });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  return handleBackendProxy(`/investments/${encodeURIComponent(code)}/transactions`, { method: 'POST', body });
}
