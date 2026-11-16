import { cookies } from 'next/headers';
import { handleBackendProxy } from '../../../../lib/backend';
import { NextResponse } from 'next/server';

export async function GET() {
  const response = await handleBackendProxy('/users/me');
  if (!response.ok) return response;

  const data = await response.json().catch(() => ({}));
  const cookieStore = await cookies();
  const token = cookieStore.get('cashflow_token')?.value;

  return NextResponse.json({ ...data, currentToken: token });
}
