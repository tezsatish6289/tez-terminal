import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, randomDelay } from '@/lib/twitter';
import { hasPostedToday, hasProcessedTweet, savePost, saveProcessedTweet } from '@/lib/twitter-db';
import { generateMemeCaption } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'content_publisher';
const POST_TYPE = 'meme' as const;

const SEARCH_QUERIES = [
  'crypto meme -is:retweet has:media lang:en',
  'bitcoin meme -is:retweet has:media lang:en',
  'trading meme -is:retweet has:media lang:en',
];

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

    const delayMs = await randomDelay(15);

    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];

    let candidates: Array<{
      id: string;
      text: string;
      authorUsername: string;
      likes: number;
      retweets: number;
    }> = [];

    try {
      const searchResult = await client.v2.search(query, {
        max_results: 50,
        'tweet.fields': ['public_metrics', 'author_id', 'created_at'],
        expansions: ['author_id'],
        'user.fields': ['username'],
        sort_order: 'relevancy',
      });

      const users = new Map<string, string>();
      if (searchResult.includes?.users) {
        for (const u of searchResult.includes.users) {
          users.set(u.id, u.username);
        }
      }

      for (const tweet of searchResult.data?.data || []) {
        const metrics = tweet.public_metrics;
        if (!metrics || metrics.like_count < 100) continue;

        candidates.push({
          id: tweet.id,
          text: tweet.text,
          authorUsername: users.get(tweet.author_id!) || 'unknown',
          likes: metrics.like_count,
          retweets: metrics.retweet_count,
        });
      }
    } catch (searchErr: unknown) {
      const msg = searchErr instanceof Error ? searchErr.message : '';
      if (msg.includes('403') || msg.includes('Forbidden')) {
        return NextResponse.json({
          skipped: true,
          reason: 'Search API not available on current Twitter tier',
          delayMs,
        });
      }
      throw searchErr;
    }

    candidates.sort((a, b) => b.likes + b.retweets - (a.likes + a.retweets));

    for (const candidate of candidates.slice(0, 10)) {
      if (await hasProcessedTweet(candidate.id)) continue;

      const evaluation = await generateMemeCaption({
        originalText: candidate.text,
        authorUsername: candidate.authorUsername,
        likeCount: candidate.likes,
        retweetCount: candidate.retweets,
      });

      if (!evaluation.shouldPost) {
        await saveProcessedTweet({
          tweetId: candidate.id,
          username: candidate.authorUsername,
          timestamp: new Date().toISOString(),
          agent_name: AGENT,
          action: 'skipped',
        });
        continue;
      }

      const { data: posted } = await client.v2.tweet({
        text: evaluation.caption,
        quote_tweet_id: candidate.id,
      });

      await saveProcessedTweet({
        tweetId: candidate.id,
        username: candidate.authorUsername,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        action: 'quoted',
      });

      await savePost({
        tweetId: posted.id,
        content: evaluation.caption,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        postType: POST_TYPE,
        metadata: {
          quotedTweetId: candidate.id,
          quotedUser: candidate.authorUsername,
          likes: candidate.likes,
          retweets: candidate.retweets,
        },
      });

      return NextResponse.json({
        success: true,
        agent: AGENT,
        postType: POST_TYPE,
        tweetId: posted.id,
        quotedTweetId: candidate.id,
        delayMs,
      });
    }

    return NextResponse.json({
      skipped: true,
      reason: 'No suitable meme found after evaluating candidates',
      candidatesChecked: candidates.length,
      delayMs,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}/${POST_TYPE}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
