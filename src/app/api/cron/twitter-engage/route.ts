import { NextRequest, NextResponse } from 'next/server';
import { getTwitterClient, getWatchlist, randomDelay } from '@/lib/twitter';
import {
  hasProcessedTweet,
  savePost,
  saveProcessedTweet,
  getDailyReplyCount,
  getRepliedToUserToday,
} from '@/lib/twitter-db';
import { generateEngagementReply } from '@/ai/flows/tweet-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const AGENT = 'engagement_agent';
const POST_TYPE = 'engagement_reply' as const;
const MAX_REPLIES_PER_SESSION = 3;
const MAX_REPLIES_PER_DAY = 12;
const MAX_REPLIES_PER_USER_PER_DAY = 2;
const HANDLES_PER_SESSION = 25;
const MIN_LIKES = 20;
const MAX_TWEET_AGE_HOURS = 12;

interface CandidateTweet {
  id: string;
  text: string;
  authorUsername: string;
  likes: number;
  replies: number;
  createdAt: string;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const isTest = new URL(request.url).searchParams.get('test') === 'true';

    const dailyCount = await getDailyReplyCount();
    if (!isTest && dailyCount >= MAX_REPLIES_PER_DAY) {
      return NextResponse.json({
        skipped: true,
        reason: `Daily reply limit reached (${dailyCount}/${MAX_REPLIES_PER_DAY})`,
      });
    }

    const client = await getTwitterClient();
    if (!client) {
      return NextResponse.json({ skipped: true, reason: 'Twitter not connected' });
    }

    const watchlist = await getWatchlist();
    if (watchlist.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'Watchlist is empty' });
    }

    const delayMs = isTest ? 0 : await randomDelay(15);

    const subset = shuffleArray(watchlist).slice(0, HANDLES_PER_SESSION);
    const cutoff = new Date(Date.now() - MAX_TWEET_AGE_HOURS * 60 * 60 * 1000);
    const candidates: CandidateTweet[] = [];

    for (const handle of subset) {
      try {
        const userRes = await client.v2.userByUsername(handle, {
          'user.fields': ['name'],
        });
        if (!userRes.data) continue;

        const timeline = await client.v2.userTimeline(userRes.data.id, {
          max_results: 10,
          'tweet.fields': ['created_at', 'public_metrics'],
          exclude: ['retweets', 'replies'],
        });

        for (const tweet of timeline.data?.data || []) {
          const createdAt = tweet.created_at ? new Date(tweet.created_at) : new Date();
          if (createdAt < cutoff) continue;

          const metrics = tweet.public_metrics;
          if (!metrics || metrics.like_count < MIN_LIKES) continue;

          candidates.push({
            id: tweet.id,
            text: tweet.text,
            authorUsername: handle,
            likes: metrics.like_count,
            replies: metrics.reply_count,
            createdAt: tweet.created_at || new Date().toISOString(),
          });
        }
      } catch (userErr: unknown) {
        const msg = userErr instanceof Error ? userErr.message : String(userErr);
        if (msg.includes('403') || msg.includes('Forbidden')) {
          return NextResponse.json({
            skipped: true,
            reason: 'Timeline API not available on current Twitter tier',
            handle,
            error: msg,
            delayMs,
          });
        }
        console.warn(`[${AGENT}] Failed to fetch @${handle}:`, msg);
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason: `No qualifying tweets from ${subset.length} watchlist handles`,
        delayMs,
      });
    }

    candidates.sort((a, b) => b.likes - a.likes);

    const repliesMade: Array<{
      replyTweetId: string;
      sourceTweetId: string;
      sourceUser: string;
      sourceLikes: number;
      replyText: string;
    }> = [];
    const skippedReplies: Array<{
      sourceUser: string;
      sourceLikes: number;
      reason: string;
    }> = [];

    const remainingBudget = isTest
      ? MAX_REPLIES_PER_SESSION
      : Math.min(MAX_REPLIES_PER_SESSION, MAX_REPLIES_PER_DAY - dailyCount);

    for (const tweet of candidates) {
      if (repliesMade.length >= remainingBudget) break;

      if (await hasProcessedTweet(tweet.id)) continue;

      const userReplies = await getRepliedToUserToday(tweet.authorUsername);
      if (userReplies >= MAX_REPLIES_PER_USER_PER_DAY) {
        await saveProcessedTweet({
          tweetId: tweet.id,
          username: tweet.authorUsername,
          timestamp: new Date().toISOString(),
          agent_name: AGENT,
          action: 'skipped',
        });
        continue;
      }

      const result = await generateEngagementReply({
        originalText: tweet.text,
        authorUsername: tweet.authorUsername,
        likeCount: tweet.likes,
        replyCount: tweet.replies,
      });

      if (!result.isRelevant || !result.reply) {
        await saveProcessedTweet({
          tweetId: tweet.id,
          username: tweet.authorUsername,
          timestamp: new Date().toISOString(),
          agent_name: AGENT,
          action: 'skipped',
        });
        continue;
      }

      let posted: { id: string } | null = null;
      let method: 'reply' | 'quote' = 'reply';

      try {
        const res = await client.v2.tweet({
          text: result.reply,
          reply: { in_reply_to_tweet_id: tweet.id },
        });
        posted = res.data;
        method = 'reply';
      } catch {
        try {
          const quoteText = `@${tweet.authorUsername} ${result.reply}`;
          const res = await client.v2.tweet({
            text: quoteText.length <= 280 ? quoteText : result.reply,
            quote_tweet_id: tweet.id,
          });
          posted = res.data;
          method = 'quote';
        } catch (quoteErr: unknown) {
          const msg = quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
          console.warn(`[${AGENT}] Both reply and quote failed for @${tweet.authorUsername}: ${msg}`);
          await saveProcessedTweet({
            tweetId: tweet.id,
            username: tweet.authorUsername,
            timestamp: new Date().toISOString(),
            agent_name: AGENT,
            action: 'skipped',
          });
          skippedReplies.push({
            sourceUser: tweet.authorUsername,
            sourceLikes: tweet.likes,
            reason: msg.includes('403') ? 'api_restricted' : msg,
          });
          continue;
        }
      }

      await saveProcessedTweet({
        tweetId: tweet.id,
        username: tweet.authorUsername,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        action: 'replied',
      });

      await savePost({
        tweetId: posted.id,
        content: result.reply,
        timestamp: new Date().toISOString(),
        agent_name: AGENT,
        postType: POST_TYPE,
        metadata: {
          sourceTweetId: tweet.id,
          sourceUser: tweet.authorUsername,
          sourceLikes: tweet.likes,
          sourceReplies: tweet.replies,
          aiReason: result.reason,
          method,
        },
      });

      repliesMade.push({
        replyTweetId: posted.id,
        sourceTweetId: tweet.id,
        sourceUser: tweet.authorUsername,
        sourceLikes: tweet.likes,
        replyText: result.reply,
      });

      if (repliesMade.length < remainingBudget) {
        const pause = 30_000 + Math.random() * 30_000;
        await new Promise((r) => setTimeout(r, pause));
      }
    }

    if (repliesMade.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'No replies posted — all candidates had reply restrictions or were irrelevant',
        candidatesFound: candidates.length,
        skippedReplies,
        delayMs,
      });
    }

    return NextResponse.json({
      success: true,
      agent: AGENT,
      postType: POST_TYPE,
      replies: repliesMade,
      skippedReplies,
      dailyTotal: dailyCount + repliesMade.length,
      delayMs,
    });
  } catch (err: unknown) {
    console.error(`[${AGENT}] Error:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
