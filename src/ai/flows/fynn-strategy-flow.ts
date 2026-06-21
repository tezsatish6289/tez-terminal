/**
 * Fynn — the F&O strategy coach for fnoninja.com.
 *
 * Reasons over a symbol's option-derived context (support/resistance bands,
 * max pain, put/call OI walls, ATM IV regime) and lays out candidate option
 * strategies with defined risk and invalidation. Education only — Fynn explains
 * scenarios and trade-offs, it does NOT give buy/sell calls or guarantees.
 *
 * Input is built server-side from the stored zone doc (see the /levels/fynn
 * route). The raw option chain never reaches the model or the browser — only
 * the same derived levels the public chart already draws.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const FynnContextSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  scope: z.enum(['stock', 'index']),
  currency: z.string().default('₹'),
  spot: z.number().nullable(),
  maxPain: z.number().nullable(),
  supportLow: z.number().nullable(),
  supportHigh: z.number().nullable(),
  resistanceLow: z.number().nullable(),
  resistanceHigh: z.number().nullable(),
  putWallStrike: z.number().nullable(),
  putWallSize: z.number().nullable(),
  callWallStrike: z.number().nullable(),
  callWallSize: z.number().nullable(),
  atmIV: z.number().nullable(),
  volRegime: z.string().nullable(),
  volRegimeReason: z.string().nullable(),
  daysToEarnings: z.number().nullable(),
  expiry: z.string().nullable(),
  today: z.string().describe("Today's date, e.g. 21 Jun 2026 — the model must NOT assume the date"),
  daysToExpiry: z.number().nullable().describe('Calendar days from today to the option expiry'),
  strikeStep: z.number().nullable().describe('Gap between adjacent strikes; all chosen strikes must be multiples of this'),
});
export type FynnContext = z.infer<typeof FynnContextSchema>;

const FynnLegSchema = z.object({
  action: z.enum(['buy', 'sell']),
  optionType: z.enum(['CE', 'PE']).describe('CE = call, PE = put'),
  strike: z.number().describe('Strike price; must sit on the strike grid (multiple of strikeStep)'),
});

const FynnStrategySchema = z.object({
  name: z.string().describe('Strategy name, e.g. "Bull Put Spread"'),
  stance: z
    .enum(['bullish', 'bearish', 'neutral', 'volatility'])
    .describe('Directional/vol stance the strategy expresses'),
  whyNow: z
    .string()
    .describe('1-2 sentences tying the strategy to THIS symbol\'s levels, OI walls and IV regime'),
  structure: z
    .string()
    .describe('Concrete legs using only the provided strikes/levels, e.g. "Sell 2400 PE / Buy 2300 PE, current expiry"'),
  legs: z
    .array(FynnLegSchema)
    .min(1)
    .max(4)
    .describe('The SAME legs as `structure`, structured. MUST match structure exactly so risk/reward can be computed.'),
  maxRisk: z.string().describe('Defined max loss in plain terms (qualitative — exact rupees are computed separately)'),
  maxReward: z.string().describe('Defined max gain / target in plain terms (qualitative)'),
  invalidation: z.string().describe('The level/condition that voids the idea'),
});

export const FynnPlanSchema = z.object({
  bias: z
    .enum(['bullish', 'lean-bullish', 'neutral', 'lean-bearish', 'bearish'])
    .describe('Net bias derived from spot vs bands and OI walls'),
  headline: z.string().describe('One punchy line summarising the setup (max ~90 chars)'),
  rationale: z
    .string()
    .describe('2-3 sentences explaining the read: spot vs bands, max pain magnet, OI walls, IV regime'),
  keyLevels: z.object({
    support: z.string().nullable(),
    resistance: z.string().nullable(),
    maxPain: z.string().nullable(),
    putWall: z.string().nullable(),
    callWall: z.string().nullable(),
  }),
  strategies: z.array(FynnStrategySchema).min(1).max(3),
  caveats: z.array(z.string()).max(4).describe('Risks/limitations: IV regime, earnings, liquidity, etc.'),
});
export type FynnPlan = z.infer<typeof FynnPlanSchema>;

const fynnPrompt = ai.definePrompt({
  name: 'fynnStrategyPlan',
  input: { schema: FynnContextSchema },
  output: { schema: FynnPlanSchema },
  prompt: `You are Fynn, an F&O (futures & options) strategy coach for Indian markets on fnoninja.com.
You help a trader think through option strategies for one symbol, grounded ONLY in the option-derived data below.
You are an educator, not an advisor: explain scenarios, structures and risk — never tell the user to buy or sell, and never promise profit.

TODAY: {{today}} — treat this as the current date. Do NOT rely on your own sense of "today".
SYMBOL: {{label}} ({{symbol}}) — {{scope}}
Currency: {{currency}}
{{#if expiry}}Option expiry used for these levels: {{expiry}}{{#if daysToExpiry}} (~{{daysToExpiry}} calendar days away){{/if}}{{/if}}
{{#if strikeStep}}Strike step (gap between strikes): {{strikeStep}} — every strike you pick MUST be a multiple of this.{{/if}}

PRICE & ZONES:
{{#if spot}}Spot: {{currency}}{{spot}}{{/if}}
{{#if maxPain}}Max pain (mean-reversion magnet): {{currency}}{{maxPain}}{{/if}}
{{#if supportLow}}Support band: {{currency}}{{supportLow}} – {{currency}}{{supportHigh}}{{/if}}
{{#if resistanceLow}}Resistance band: {{currency}}{{resistanceLow}} – {{currency}}{{resistanceHigh}}{{/if}}

OPTION OPEN-INTEREST WALLS:
{{#if putWallStrike}}Put OI wall (support floor): {{putWallSize}} contracts @ {{currency}}{{putWallStrike}}{{/if}}
{{#if callWallStrike}}Call OI wall (resistance cap): {{callWallSize}} contracts @ {{currency}}{{callWallStrike}}{{/if}}

VOLATILITY:
{{#if atmIV}}ATM implied volatility: {{atmIV}}%{{/if}}
{{#if volRegime}}Volatility regime: {{volRegime}}{{#if volRegimeReason}} ({{volRegimeReason}}){{/if}}{{/if}}
{{#if daysToEarnings}}Approx days to earnings/event: {{daysToEarnings}}{{/if}}

HOW TO REASON:
1. Bias — compare spot to the support/resistance bands and the OI walls. Near support with a heavy put wall below = floor (lean bullish). Near resistance with a heavy call wall above = cap (lean bearish). Mid-band or pinned to max pain = neutral/range.
2. Strikes — build strategies ONLY around the provided strikes (put wall, call wall), the bands, and max pain. Do NOT invent specific strikes that aren't anchored to this data; round sensibly to the nearest listed strike.
3. IV regime drives strategy TYPE — this is a HARD rule, not a preference:
   - Calm / low IV → options are cheap, so selling them pays too little for the risk. Your FIRST (and ideally every) idea must be a DEBIT / buying structure: bull call spread, bear put spread, long call/put, debit-based directional plays. Do NOT lead with a credit spread or iron condor when IV is calm. Only add a credit idea as a secondary option if you explicitly justify why (e.g. a very tight range pinned to max pain), and clearly note the premium collected will be thin.
   - High / elevated IV → options are expensive, so harvest premium. Favour defined-risk CREDIT structures (credit spreads, iron condor).
   - Earnings/event near → flag the IV-crush risk; prefer defined-risk or staying flat over naked premium.
4. TIME HORIZON — reason from daysToExpiry, never from your own date assumption. Indian stock/index options are monthly, so the expiry above is almost always the NEAR month:
   - <14 days = SHORT-DATED. Theta decay is fast and accelerating — this HELPS premium sellers and HURTS option buyers. Max pain pins hardest into expiry, but a large gap between spot and max pain is unlikely to fully close in the time left, so treat a far max pain as a soft directional bias, not a price target.
   - 14-45 days = standard monthly horizon.
   - Never describe a near-month expiry as "long-dated" or claim "theta decay is minimal". Judge whether the move implied by your bias is realistic in the days remaining.
5. Always prefer DEFINED-RISK structures (spreads) over naked options. State max risk, max reward and the invalidation level for each.
6. Use max pain as a magnet/soft bias scaled by time and distance, never a guarantee or a hard target.

OUTPUT RULES:
- For every strategy, the structured \`legs\` array MUST exactly match the prose \`structure\` (same strikes, same buy/sell, same CE/PE). The rupee max-risk/reward and break-evens are computed from \`legs\`, so any mismatch produces wrong numbers.
- Every strike in \`legs\` must be a multiple of the strike step.
- Give 1-3 candidate strategies, ordered best-fit first. If the picture is genuinely unclear, it's fine to give one "wait / no clean setup" style note as the rationale and a single low-conviction idea.
- Keep language plain and concise. Indian retail trader audience.
- Never use the words "guaranteed", "sure-shot", or "tip". Never give a price target as a promise.
- Populate keyLevels with the numbers above (formatted with the currency); use null where a value is missing.
- caveats must include the IV regime implication and any earnings/liquidity risk you see.`,
});

export async function generateFynnPlan(context: FynnContext): Promise<FynnPlan> {
  const { output } = await fynnPrompt(context);
  return output!;
}
