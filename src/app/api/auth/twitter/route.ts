import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateAuthLink } from '@/lib/twitter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/api/auth/twitter/callback`;

  const { url, codeVerifier, state } = generateAuthLink(callbackUrl);

  const cookieStore = await cookies();

  cookieStore.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  cookieStore.set('twitter_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return NextResponse.redirect(url);
}
