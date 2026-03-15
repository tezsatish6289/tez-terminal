import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleOAuthCallback } from '@/lib/twitter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const origin = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(
      `${origin}/admin/social?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/admin/social?error=missing_params`,
    );
  }

  const cookieStore = await cookies();
  const storedVerifier = cookieStore.get('twitter_code_verifier')?.value;
  const storedState = cookieStore.get('twitter_oauth_state')?.value;

  if (!storedVerifier || !storedState || storedState !== state) {
    return NextResponse.redirect(
      `${origin}/admin/social?error=invalid_state`,
    );
  }

  try {
    const callbackUrl = `${origin}/api/auth/twitter/callback`;
    await handleOAuthCallback(code, storedVerifier, callbackUrl);

    cookieStore.delete('twitter_code_verifier');
    cookieStore.delete('twitter_oauth_state');

    return NextResponse.redirect(`${origin}/admin/social?connected=true`);
  } catch (err: unknown) {
    console.error('[Twitter OAuth] Callback failed:', err);
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.redirect(
      `${origin}/admin/social?error=${encodeURIComponent(message)}`,
    );
  }
}
