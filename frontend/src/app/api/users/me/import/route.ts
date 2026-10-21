import { NextRequest } from 'next/server';
import { handleBackendProxy } from '../../../../../lib/backend';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handleBackendProxy('/users/me/import', {
    method: 'POST',
    body
  });
}
