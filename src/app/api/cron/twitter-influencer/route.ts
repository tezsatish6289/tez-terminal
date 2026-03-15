import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, getWatchlist, randomDelay } from '@/lib/twitter';
import { hasPostedToday, hasProcessedTweet, savePost, saveProcessedTweet } from '@/lib/twitter-db';
import { generateInfluencerCommentary } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'content_publisher';
const POST_TYPE = 'influencer' as const;

interface CandidateTweet {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  likes: number;
  retweets: number;
  createdAt: string;
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

    const watchlist = await getWatchlist();
    if (watchlist.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'Watchlist is empty' });
    }

    const delayMs = await randomDelay(15);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates: CandidateTweet[] = [];

    for (const handle of watchlist) {
      try {
        const userRes = await client.v2.userByUsername(handle, {
          'user.fields': ['name'],
        });
        if (!userRes.data) continue;

        const userId = userRes.data.id;
        const displayName = userRes.data.name;

        const timeline = await client.v2.userTimeline(userId, {
          max_results: 10,
          'tweet.fields': ['created_at', 'public_metrics'],
          exclude: ['retweets', 'replies'],
        });

        for (const tweet of timeline.data?.data || []) {
          const createdAt = tweet.created_at ? new Date(tweet.created_at) : new Date();
          if (createdAt < oneDayAgo) continue;

          const metrics = tweet.public_metrics;
          if (!metrics || metrics.like_count < 50) continue;

          candidates.push({
            id: tweet.id,
            text: tweet.text,
            authorUsername: handle,
            authorName: displayName,
            likes: metrics.like_count,
            retweets: metrics.retweet_count,
            createdAt: tweet.created_at || new Date().toISOString(),
          });
        }
      } catch (userErr: unknown) {
        const msg = userErr instanceof Error ? userErr.message : '';
        if (msg.includes('403') || msg.includes('Forbidden')) {
          return NextResponse.json({
            skipped: true,
            reason: 'Timeline API not available on current Twitter tier',
            delayMs,
          });
        }
        console.warn(`[${AGENT}/${POST_TYPE}] Failed to fetch @${handle}:`, msg);
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'No qualifying tweets from watchlist in last 24h',
        delayMs,
      });
    }

    candidates.sort((a, b) => (b.likes + b.retweets) - (a.likes + a.retweets));

    for (const best of candidates.slice(0, 5)) {
      if (await hasProcessedTweet(best.id)) continue;

      const commentary = await generateInfluencerCommentary({
        originalText: best.text,
        authorUsername: best.authorUsername,
        authorDisplayName: best.authorName,
        tweetUrl: `https://x.com/${best.authorUsername}/status/${best.id}`,
      });

      const tweetUrl = `https://x.com/${best.authorUsername}/status/${best.id}`;
      const fullTweet = `${commentary}\n\n${tweetUrl}`;

      const { data: posted } = await client.v2.tweet(
        fullTweet.length <= 280 ? fullTweet : commentary,
      );

      await saveProcessedTweet({
        tweetId: best.id,
        username: best.authorUsername,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        action: 'commented',
      });

      await savePost({
        tweetId: posted.id,
        content: commentary,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        postType: POST_TYPE,
        metadata: {
          sourceTweetId: best.id,
          sourceUser: best.authorUsername,
          sourceLikes: best.likes,
          sourceRetweets: best.retweets,
        },
      });

      return NextResponse.json({
        success: true,
        agent: AGENT,
        postType: POST_TYPE,
        tweetId: posted.id,
        sourceTweet: {
          id: best.id,
          user: best.authorUsername,
          likes: best.likes,
        },
        delayMs,
      });
    }

    return NextResponse.json({
      skipped: true,
      reason: 'All candidate tweets already processed',
      delayMs,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}/${POST_TYPE}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
