'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// ─── Trade Report Tweet ──────────────────────────────────────────────

const TradeReportInputSchema = z.object({
  date: z.string(),
  topWinner: z.object({
    symbol: z.string(),
    side: z.string(),
    pnl: z.number(),
    maxReturn: z.number(),
    tp1Hit: z.boolean(),
    tp2Hit: z.boolean(),
    tp3Hit: z.boolean(),
    algo: z.string(),
    timeframe: z.string(),
  }).nullable(),
  summary: z.object({
    totalRetiredTrades: z.number(),
    winningTrades: z.number(),
    losingTrades: z.number(),
    winRate: z.number(),
  }),
  runnersUp: z.array(z.object({
    symbol: z.string(),
    side: z.string(),
    pnl: z.number(),
  })),
});

const tradeReportPrompt = ai.definePrompt({
  name: 'tradeReportTweet',
  input: { schema: TradeReportInputSchema },
  output: { schema: z.object({ tweet: z.string() }) },
  prompt: `You are the social media voice for TezTerminal, a crypto algo-trading platform. Write a confident, data-driven tweet summarizing yesterday's algo performance.

DATA:
Date: {{date}}
{{#if topWinner}}
Top Trade: {{topWinner.symbol}} {{topWinner.side}}
PNL: {{topWinner.pnl}}%
Max Return: {{topWinner.maxReturn}}%
TP Hits: {{topWinner.tp1Hit}}/{{topWinner.tp2Hit}}/{{topWinner.tp3Hit}}
Algo: {{topWinner.algo}} ({{topWinner.timeframe}})
{{/if}}
Total Trades: {{summary.totalRetiredTrades}}
Win Rate: {{summary.winRate}}%
Wins: {{summary.winningTrades}} | Losses: {{summary.losingTrades}}

RULES:
- Max 260 characters (leave room for potential image link)
- Use line breaks for readability
- Sound like a confident trader, not a marketer
- Include key numbers: best PNL, win rate, total trades
- End with a one-liner that conveys consistency/edge
- No hashtags, no emojis, no "🚀"
- Never say "not financial advice"
- If no data (topWinner is null), write a brief "quiet day" tweet`,
});

export async function generateTradeReportTweet(data: z.infer<typeof TradeReportInputSchema>): Promise<string> {
  const { output } = await tradeReportPrompt(data);
  return output!.tweet;
}

// ─── Liquidation Tweet ───────────────────────────────────────────────

const LiquidationInputSchema = z.object({
  asset: z.string().optional(),
  amount: z.string().optional(),
  direction: z.string().optional(),
  timeframe: z.string().optional(),
  btcPrice: z.string().optional(),
  btcChange: z.string().optional(),
  ethPrice: z.string().optional(),
  ethChange: z.string().optional(),
});

const liquidationPrompt = ai.definePrompt({
  name: 'liquidationTweet',
  input: { schema: LiquidationInputSchema },
  output: { schema: z.object({ tweet: z.string() }) },
  prompt: `You are the social media voice for TezTerminal, a crypto algo-trading platform. Write a high-energy tweet about crypto market conditions, liquidations, and risk.

MARKET DATA (use these real numbers in your tweet):
BTC: {{btcPrice}} ({{btcChange}} 24h)
ETH: {{ethPrice}} ({{ethChange}} 24h)
{{#if amount}}
Liquidations ({{timeframe}}): {{amount}} — mostly {{direction}}
{{/if}}

RULES:
- Max 260 characters
- MUST reference at least one real number from the data above (price, % change, liquidation amount)
- Use line breaks for dramatic effect
- Sound like a seasoned trader observing the market
- Connect the price action to a lesson about risk, leverage, or position sizing
- No hashtags, no emojis
- Be punchy. Short sentences. Real numbers.
- NEVER be vague or generic. Every tweet must feel grounded in today's market.

Example energy (DO NOT copy verbatim):
"BTC down 4.2% today. $240M in longs liquidated.

Same pattern. Leverage builds, market resets.

Size your positions or the market sizes them for you."`,
});

export async function generateLiquidationTweet(data: z.infer<typeof LiquidationInputSchema>): Promise<string> {
  const { output } = await liquidationPrompt(data);
  return output!.tweet;
}

// ─── Meme Caption ────────────────────────────────────────────────────

const MemeCaptionInputSchema = z.object({
  originalText: z.string(),
  authorUsername: z.string(),
  likeCount: z.number(),
  retweetCount: z.number(),
});

const memeCaptionPrompt = ai.definePrompt({
  name: 'memeCaptionTweet',
  input: { schema: MemeCaptionInputSchema },
  output: { schema: z.object({
    shouldPost: z.boolean().describe('true if the meme naturally connects to trading/markets'),
    caption: z.string().describe('witty quote-tweet caption if shouldPost is true, empty if false'),
    reason: z.string().describe('brief reason for the decision'),
  }) },
  prompt: `You are the social media voice for TezTerminal, a crypto algo-trading platform. Evaluate if this viral crypto tweet/meme is worth quote-tweeting and write a caption.

ORIGINAL TWEET by @{{authorUsername}}:
"{{originalText}}"
Likes: {{likeCount}} | Retweets: {{retweetCount}}

EVALUATE:
1. Does this meme/tweet connect naturally to trading, markets, or the trader experience?
2. Can you add a witty, relatable caption from a trader's perspective?
3. Is the original content safe to associate with a professional trading brand? (no slurs, scams, NSFW)

If YES to all three → set shouldPost = true and write a caption.
If NO to any → set shouldPost = false and explain why.

CAPTION RULES:
- Max 200 characters
- Sound like a trader who finds this genuinely funny
- Add a trading angle or personal trader experience
- No hashtags, no emojis
- Don't explain the joke

Example energy (DO NOT copy):
"Market when your stop loss hits exactly before the pump."`,
});

export async function generateMemeCaption(data: z.infer<typeof MemeCaptionInputSchema>) {
  const { output } = await memeCaptionPrompt(data);
  return output!;
}

// ─── Influencer Commentary ───────────────────────────────────────────

const InfluencerInputSchema = z.object({
  originalText: z.string(),
  authorUsername: z.string(),
  authorDisplayName: z.string().optional(),
  tweetUrl: z.string().optional(),
});

const influencerPrompt = ai.definePrompt({
  name: 'influencerCommentaryTweet',
  input: { schema: InfluencerInputSchema },
  output: { schema: z.object({ tweet: z.string() }) },
  prompt: `You are the social media voice for TezTerminal, a crypto algo-trading platform. Write commentary on this tweet from a prominent crypto figure.

ORIGINAL TWEET by @{{authorUsername}}:
"{{originalText}}"

RULES:
- Max 260 characters
- Credit the original author naturally (mention @{{authorUsername}})
- Add a trader's perspective or insight — don't just agree
- DO NOT copy or paraphrase the original text
- Sound thoughtful and informed, not sycophantic
- Use line breaks for readability
- No hashtags, no emojis
- End with a forward-looking market take or observation

Example energy (DO NOT copy):
"Interesting point from @rektcapital.

Market structure is tightening across majors.

If BTC holds this level, we could see the next leg soon."`,
});

export async function generateInfluencerCommentary(data: z.infer<typeof InfluencerInputSchema>): Promise<string> {
  const { output } = await influencerPrompt(data);
  return output!.tweet;
}
