import { handleBackendProxy } from '../../../../../lib/backend';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return handleBackendProxy(`/investments/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return handleBackendProxy(`/investments/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleBackendProxy(`/investments/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
