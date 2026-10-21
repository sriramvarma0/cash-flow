import { handleBackendProxy } from '../../../../lib/backend';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  return handleBackendProxy(`/investments/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    body
  });
}
