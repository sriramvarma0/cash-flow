import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const rawBackendUrl =
  process.env.INTERNAL_BACKEND_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  `http://127.0.0.1:${process.env.BACKEND_PORT || '4000'}`;

export const backendUrl = rawBackendUrl.replace(/\/$/, '');

export async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get('cashflow_token')?.value ?? null;
}

export async function handleBackendProxy(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    headers?: Record<string, string>;
    body?: any;
    searchParams?: URLSearchParams;
  } = {}
) {
  const token = await getAuthToken();
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(`${backendUrl}${path}`);
  if (options.searchParams) {
    options.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error(`Error proxying to backend path ${path}:`, error);
    return NextResponse.json(
      { message: 'Backend service is temporarily unavailable' },
      { status: 503 }
    );
  }
}
