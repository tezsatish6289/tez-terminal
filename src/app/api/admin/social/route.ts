import { NextRequest, NextResponse } from 'next/server';
import {
  getTwitterCredentials,
  disconnectTwitter,
  getWatchlist,
  updateWatchlist,
} from '@/lib/twitter';
import { getTodayStats, getRecentActivity } from '@/lib/twitter-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [credentials, watchlist, todayStats, recentActivity] =
      await Promise.all([
        getTwitterCredentials(),
        getWatchlist(),
        getTodayStats(),
        getRecentActivity(30),
      ]);

    return NextResponse.json({
      connected: !!credentials,
      account: credentials
        ? {
            username: credentials.username,
            userId: credentials.userId,
            connectedAt: credentials.connectedAt,
          }
        : null,
      watchlist,
      todayStats,
      recentActivity,
    });
  } catch (err: unknown) {
    console.error('[Admin Social] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load social data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'disconnect': {
        await disconnectTwitter();
        return NextResponse.json({ success: true, message: 'Twitter disconnected' });
      }

      case 'update_watchlist': {
        const { handles } = body as { handles: string[] };
        if (!Array.isArray(handles)) {
          return NextResponse.json({ error: 'handles must be an array' }, { status: 400 });
        }
        await updateWatchlist(handles);
        const updated = await getWatchlist();
        return NextResponse.json({ success: true, watchlist: updated });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error('[Admin Social] POST failed:', err);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}
