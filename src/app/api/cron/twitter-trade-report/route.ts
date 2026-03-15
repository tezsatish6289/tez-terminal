import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, randomDelay } from '@/lib/twitter';
import { hasPostedToday, savePost } from '@/lib/twitter-db';
import { generateTradeReportTweet } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'content_publisher';
const POST_TYPE = 'trade_report' as const;

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (await hasPostedToday(POST_TYPE)) {
      return NextResponse.json({ skipped: true, reason: 'Already posted today' });
    }

    const client = await getTwitterClient();
    if (!client) {
      return NextResponse.json({ skipped: true, reason: 'Twitter not connected' });
    }

    const isTest = new URL(request.url).searchParams.get('test') === 'true';
    const delayMs = isTest ? 0 : await randomDelay(15);

    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/yesterday-winners`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch yesterday winners', status: res.status }, { status: 500 });
    }
    const data = await res.json();

    const tweet = await generateTradeReportTweet({
      date: data.date || new Date().toISOString().slice(0, 10),
      topWinner: data.topWinner || null,
      summary: data.summary || { totalRetiredTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0 },
      runnersUp: data.runnersUp || [],
    });

    const { data: posted } = await client.v2.tweet(tweet);

    await savePost({
      tweetId: posted.id,
      content: tweet,
      timestamp: new Date().toISOString(),
      agent_name: AGENT,
      postType: POST_TYPE,
      metadata: {
        date: data.date,
        topWinner: data.topWinner?.symbol,
        winRate: data.summary?.winRate,
        totalTrades: data.summary?.totalRetiredTrades,
      },
    });

    return NextResponse.json({
      success: true,
      agent: AGENT,
      postType: POST_TYPE,
      tweetId: posted.id,
      delayMs,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}/${POST_TYPE}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
