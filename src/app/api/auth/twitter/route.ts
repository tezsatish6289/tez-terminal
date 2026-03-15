import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateAuthLink } from '@/lib/twitter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!process.env.TWITTER_CLIENT_ID || !process.env.TWITTER_CLIENT_SECRET
    || process.env.TWITTER_CLIENT_ID === 'your_twitter_client_id') {
    return NextResponse.json(
      { error: 'Twitter API credentials not configured. Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in environment variables.' },
      { status: 500 },
    );
  }

  try {
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
  } catch (err: unknown) {
    console.error('[Twitter OAuth] Failed to generate auth link:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `OAuth initiation failed: ${message}` }, { status: 500 });
  }
}
