import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken) {
      return NextResponse.json({ message: 'Access token required' }, { status: 400 });
    }

    const isSecure = request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https';
    const cookieStore = await cookies();
    cookieStore.set('cashflow_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecure,
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to switch account' },
      { status: 500 }
    );
  }
}
