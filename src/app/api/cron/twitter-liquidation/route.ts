import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, randomDelay } from '@/lib/twitter';
import { hasPostedToday, savePost } from '@/lib/twitter-db';
import { generateLiquidationTweet } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'content_publisher';
const POST_TYPE = 'liquidation' as const;

interface MarketContext {
  btcPrice: number;
  btcChange24h: number;
  ethPrice: number;
  ethChange24h: number;
  liquidationAmount?: string;
  liquidationDirection?: string;
}

async function fetchMarketContext(): Promise<MarketContext | null> {
  try {
    const [btcRes, ethRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { cache: 'no-store' }),
      fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', { cache: 'no-store' }),
    ]);

    if (!btcRes.ok || !ethRes.ok) return null;

    const [btc, eth] = await Promise.all([btcRes.json(), ethRes.json()]);

    const context: MarketContext = {
      btcPrice: Math.round(parseFloat(btc.lastPrice)),
      btcChange24h: parseFloat(parseFloat(btc.priceChangePercent).toFixed(2)),
      ethPrice: Math.round(parseFloat(eth.lastPrice)),
      ethChange24h: parseFloat(parseFloat(eth.priceChangePercent).toFixed(2)),
    };

    if (process.env.COINGLASS_API_KEY) {
      try {
        const liqRes = await fetch(
          'https://open-api-v3.coinglass.com/api/futures/liquidation/v2/home',
          {
            headers: {
              accept: 'application/json',
              coinglassSecret: process.env.COINGLASS_API_KEY,
            },
            cache: 'no-store',
          },
        );
        if (liqRes.ok) {
          const liqJson = await liqRes.json();
          const liqData = liqJson?.data;
          const totalLiqUsd = liqData?.totalVolUsd || liqData?.h24LiquidationUsd;
          if (totalLiqUsd) {
            context.liquidationAmount =
              totalLiqUsd >= 1_000_000_000
                ? `$${(totalLiqUsd / 1_000_000_000).toFixed(2)}B`
                : totalLiqUsd >= 1_000_000
                  ? `$${(totalLiqUsd / 1_000_000).toFixed(0)}M`
                  : `$${(totalLiqUsd / 1_000).toFixed(0)}K`;
            context.liquidationDirection = (liqData.longRate ?? 50) > 50 ? 'longs' : 'shorts';
          }
        }
      } catch { /* coinglass optional */ }
    }

    return context;
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

    const market = await fetchMarketContext();

    const tweet = await generateLiquidationTweet({
      asset: market?.liquidationAmount ? 'Crypto' : undefined,
      amount: market?.liquidationAmount,
      direction: market?.liquidationDirection,
      timeframe: market?.liquidationAmount ? '24 hours' : undefined,
      btcPrice: market?.btcPrice ? `$${market.btcPrice.toLocaleString()}` : undefined,
      btcChange: market?.btcChange24h !== undefined ? `${market.btcChange24h > 0 ? '+' : ''}${market.btcChange24h}%` : undefined,
      ethPrice: market?.ethPrice ? `$${market.ethPrice.toLocaleString()}` : undefined,
      ethChange: market?.ethChange24h !== undefined ? `${market.ethChange24h > 0 ? '+' : ''}${market.ethChange24h}%` : undefined,
    });

    const { data: posted } = await client.v2.tweet(tweet);

    await savePost({
      tweetId: posted.id,
      content: tweet,
      timestamp: new Date().toISOString(),
      agent_name: AGENT,
      postType: POST_TYPE,
      metadata: market ? { ...market } : { source: 'ai_generated' },
    });

    return NextResponse.json({
      success: true,
      agent: AGENT,
      postType: POST_TYPE,
      tweetId: posted.id,
      delayMs,
      hadLiquidationData: !!market?.liquidationAmount,
      hadMarketData: !!market,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}/${POST_TYPE}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
