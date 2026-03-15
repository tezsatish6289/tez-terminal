'use server';
/**
 * @fileOverview Advanced Technical Signal Analysis Agent.
 *
 * - analyzeSignal - Analyzes a trading signal using quantitative metrics.
 * - AnalyzeSignalInput - Input schema containing signal and market data.
 * - AnalyzeSignalOutput - Structured technical outlook and recommendation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const AnalyzeSignalInputSchema = z.object({
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL', 'NEUTRAL']),
  entryPrice: z.number(),
  currentPrice: z.number(),
  timeframe: z.string(),
  maxUpside: z.number().optional(),
  maxDrawdown: z.number().optional(),
  assetType: z.string().optional(),
  exchange: z.string().optional(),
});
export type AnalyzeSignalInput = z.infer<typeof AnalyzeSignalInputSchema>;

const AnalyzeSignalOutputSchema = z.object({
  recommendation: z.enum(['STRONG BUY', 'BUY', 'HOLD', 'WAIT FOR PULLBACK', 'AVOID']),
  confidenceScore: z.number().describe('A score from 0-100 indicating the AI confidence in the recommendation.'),
  technicalReasoning: z.string().describe('A comprehensive technical explanation including market structure analysis.'),
  riskAssessment: z.string().describe('Analysis of volatility, liquidity, and potential invalidation zones.'),
  suggestedStopLoss: z.number().optional().describe('A technically suggested stop loss based on recent swing lows/highs.'),
  suggestedTakeProfit: z.number().optional().describe('A technically suggested target price based on Fibonacci or resistance levels.'),
});
export type AnalyzeSignalOutput = z.infer<typeof AnalyzeSignalOutputSchema>;

export async function analyzeSignal(input: AnalyzeSignalInput): Promise<AnalyzeSignalOutput> {
  return analyzeSignalFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeSignalPrompt',
  model: googleAI.model('gemini-2.5-flash'),
  input: { schema: AnalyzeSignalInputSchema },
  output: { schema: AnalyzeSignalOutputSchema },
  prompt: `You are the Lead Quantitative Strategist at a Tier-1 Global Hedge Fund. Your expertise is in Technical Analysis (TA), Market Microstructure, and Risk Management.

Analyze the following trading signal with extreme precision:

Asset: {{symbol}} ({{assetType}})
Signal: {{type}} | Timeframe: {{timeframe}}
Entry Level: {{entryPrice}} | Current Market Price: {{currentPrice}}
Performance Since Alert: Upside {{maxUpside}}% | Drawdown {{maxDrawdown}}%

### Analytical Framework:
1. **Market Structure**: Evaluate if the current price movement suggests a sustainable trend or a "liquidity grab."
2. **Entry Validity**: Is the price still within a 0.5% - 1% range of the entry? If it has moved >2% in favor, suggest waiting for a retracement.
3. **Volatility Risk**: High-timeframe (Daily) signals are more reliable than low-timeframe (1m-5m) scalps. Adjust confidence accordingly.
4. **Invalidation**: Identify the specific price level where this technical thesis fails.
5. **Reward/Risk Ratio**: Ensure the suggested Take Profit offers at least a 2:1 ratio against the Stop Loss.

### Instructions:
- Provide a recommendation that a professional trader would act upon.
- Be concise but deeply technical in your reasoning.
- Use "Market Structure Shift," "Order Block," or "Supply/Demand" terminology where appropriate.
- If the drawdown is significant (>3%), assess if the trend is broken or if it's a "deep discount" entry.`,
});

const analyzeSignalFlow = ai.defineFlow(
  {
    name: 'analyzeSignalFlow',
    inputSchema: AnalyzeSignalInputSchema,
    outputSchema: AnalyzeSignalOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error('Advanced AI analysis failed to generate a structured response.');
    return output;
  }
);
