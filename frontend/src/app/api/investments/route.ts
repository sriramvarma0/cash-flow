import { handleBackendProxy } from '../../../lib/backend';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handleBackendProxy('/investments', { method: 'GET', searchParams });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return handleBackendProxy('/investments', { method: 'POST', body });
}
