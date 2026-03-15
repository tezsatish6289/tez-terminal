import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, randomDelay } from '@/lib/twitter';
import { hasPostedToday, savePost } from '@/lib/twitter-db';
import { generateLiquidationTweet } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'content_publisher';
const POST_TYPE = 'liquidation' as const;

interface LiquidationEvent {
  asset: string;
  amount: string;
  direction: string;
  timeframe: string;
}

async function fetchLiquidationData(): Promise<LiquidationEvent | null> {
  try {
    const res = await fetch(
      'https://open-api-v3.coinglass.com/api/futures/liquidation/v2/home',
      {
        headers: {
          accept: 'application/json',
          ...(process.env.COINGLASS_API_KEY
            ? { coinglassSecret: process.env.COINGLASS_API_KEY }
            : {}),
        },
        cache: 'no-store',
      },
    );

    if (!res.ok) return null;

    const json = await res.json();
    const data = json?.data;
    if (!data) return null;

    const totalLiqUsd = data.totalVolUsd || data.h24LiquidationUsd;
    if (!totalLiqUsd) return null;

    const formatted =
      totalLiqUsd >= 1_000_000_000
        ? `$${(totalLiqUsd / 1_000_000_000).toFixed(2)}B`
        : totalLiqUsd >= 1_000_000
          ? `$${(totalLiqUsd / 1_000_000).toFixed(0)}M`
          : `$${(totalLiqUsd / 1_000).toFixed(0)}K`;

    return {
      asset: 'Crypto',
      amount: formatted,
      direction: (data.longRate ?? 50) > 50 ? 'longs' : 'shorts',
      timeframe: '24 hours',
    };
  } catch {
    return null;
  }
}

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

    const liqData = await fetchLiquidationData();

    const tweet = await generateLiquidationTweet({
      asset: liqData?.asset,
      amount: liqData?.amount,
      direction: liqData?.direction,
      timeframe: liqData?.timeframe,
    });

    const { data: posted } = await client.v2.tweet(tweet);

    await savePost({
      tweetId: posted.id,
      content: tweet,
      timestamp: new Date().toISOString(),
      agent_name: AGENT,
      postType: POST_TYPE,
      metadata: liqData ? { ...liqData } : { source: 'ai_generated' },
    });

    return NextResponse.json({
      success: true,
      agent: AGENT,
      postType: POST_TYPE,
      tweetId: posted.id,
      delayMs,
      hadLiquidationData: !!liqData,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}/${POST_TYPE}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
