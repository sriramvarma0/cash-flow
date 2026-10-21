import { handleBackendProxy } from '../../../../lib/backend';

export async function GET() {
  return handleBackendProxy('/groups/my-requests');
}
