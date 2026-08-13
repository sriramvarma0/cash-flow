import { handleBackendProxy } from '../../../../lib/backend';

export async function GET() {
  return handleBackendProxy('/users/me');
}
