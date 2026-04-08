import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/ai/genkit";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are FreedomBot, a friendly and knowledgeable AI assistant for FreedomBot.ai — a platform that deploys AI trading bots to fastrack users' financial freedom.

About FreedomBot.ai:
- We run automated trading bots that trade financial markets 24/7
- Currently live: Crypto Bot (trading crypto markets on Binance)
- Coming soon: Indian Stock Bot, Gold Bot, Silver Bot
- Our crypto bot uses advanced algorithms and AI to identify high-probability trade setups
- Users can deploy the crypto bot with one click and watch it trade for them
- We show transparent performance stats: win rate, profit/day, profit/month, profit/year

Your personality:
- Friendly, confident, and approachable
- Use simple language — avoid jargon when possible
- Be honest about limitations (e.g., "coming soon" bots aren't live yet)
- Keep responses concise (2-4 sentences unless more detail is truly needed)
- You can use the occasional emoji for warmth

Topics you can help with:
- How FreedomBot works
- What bots are available and coming soon
- How to get started
- Performance and risk questions
- General trading and financial freedom concepts

Do NOT:
- Make specific profit guarantees
- Give personalized financial advice
- Discuss competitor platforms in detail
- Share technical implementation details`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // Build a single prompt that includes the full conversation history
    const conversationContext = messages
      .slice(0, -1)
      .map((m: { role: string; content: string }) =>
        m.role === "user" ? `User: ${m.content}` : `FreedomBot: ${m.content}`
      )
      .join("\n");

    const lastMessage = messages[messages.length - 1];

    const fullPrompt = conversationContext
      ? `${conversationContext}\nUser: ${lastMessage.content}\nFreedomBot:`
      : lastMessage.content;

    const { text } = await ai.generate({
      system: SYSTEM_PROMPT,
      prompt: fullPrompt,
    });

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("[FreedomBot Chat]", error.message);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
