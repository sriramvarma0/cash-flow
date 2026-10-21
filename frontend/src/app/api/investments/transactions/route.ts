import { handleBackendProxy } from '../../../../lib/backend';

export async function GET() {
  return handleBackendProxy('/investments/transactions', { method: 'GET' });
}
