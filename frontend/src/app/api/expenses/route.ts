import { handleBackendProxy } from '../../../lib/backend';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handleBackendProxy('/expenses', { method: 'GET', searchParams });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return handleBackendProxy('/expenses', { method: 'POST', body });
}
