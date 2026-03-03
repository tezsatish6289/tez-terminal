/**
 * Telegram Bot API utility.
 * All bot interactions go through this module.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: { id: number };
    };
    data?: string;
  };
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

async function callApi(method: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[Telegram API] ${method} failed:`, data.description);
  }
  return data;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  }
): Promise<any> {
  return callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode ?? "HTML",
    ...(options?.replyMarkup && { reply_markup: options.replyMarkup }),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<any> {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text && { text }),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  }
): Promise<any> {
  return callApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options?.parseMode ?? "HTML",
    ...(options?.replyMarkup && { reply_markup: options.replyMarkup }),
  });
}

export async function setWebhook(url: string): Promise<any> {
  return callApi("setWebhook", { url, allowed_updates: ["message", "callback_query"] });
}

export async function deleteWebhook(): Promise<any> {
  return callApi("deleteWebhook", {});
}

const TIMEFRAME_NAMES: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
  "D": "Positional",
};

export function getTimeframeName(tf: string): string {
  return TIMEFRAME_NAMES[tf] || tf;
}

export interface SignalEvent {
  type: "NEW_SIGNAL" | "TP1_HIT" | "TP2_HIT" | "TP3_HIT" | "SL_HIT";
  signalId: string;
  symbol: string;
  side: "BUY" | "SELL";
  timeframe: string;
  assetType: string;
  entryPrice: number;
  price: number;
  stopLoss?: number;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  bookedPnl?: number | null;
  totalBookedPnl?: number | null;
  guidance: string;
}

export function formatSignalMessage(event: SignalEvent): string {
  const direction = event.side === "BUY" ? "LONG" : "SHORT";
  const dirIcon = event.side === "BUY" ? "🟢" : "🔴";
  const tfName = getTimeframeName(event.timeframe);

  switch (event.type) {
    case "NEW_SIGNAL": {
      const lines = [
        `${dirIcon} <b>NEW SIGNAL: ${event.symbol} — ${direction}</b>`,
        ``,
        `📊 ${tfName} (${event.timeframe === "D" ? "Daily" : event.timeframe + "m"}) | ${event.assetType}`,
        `💰 Entry: ${event.entryPrice}`,
      ];
      if (event.tp1 != null && event.tp2 != null && event.tp3 != null) {
        lines.push(`🎯 TP1: ${event.tp1} | TP2: ${event.tp2} | TP3: ${event.tp3}`);
      }
      if (event.stopLoss) {
        lines.push(`🛑 SL: ${event.stopLoss}`);
      }
      lines.push(``);
      lines.push(`<i>Strategy: Book 50% at TP1, 25% at TP2, 25% at TP3</i>`);
      return lines.join("\n");
    }

    case "TP1_HIT": {
      const pnl = event.bookedPnl != null ? ` (${event.bookedPnl > 0 ? "+" : ""}${event.bookedPnl.toFixed(2)}%)` : "";
      return [
        `🎯 <b>TP1 HIT: ${event.symbol} — ${direction}</b>`,
        ``,
        `✅ Book 50% profit${pnl}`,
        `🛑 SL moved to cost (${event.entryPrice})`,
        ``,
        `<i>Remaining: 50% position riding to TP2 (${event.tp2})</i>`,
      ].join("\n");
    }

    case "TP2_HIT": {
      const pnl = event.bookedPnl != null ? ` (${event.bookedPnl > 0 ? "+" : ""}${event.bookedPnl.toFixed(2)}%)` : "";
      return [
        `🎯🎯 <b>TP2 HIT: ${event.symbol} — ${direction}</b>`,
        ``,
        `✅ Book 25% more profit${pnl}`,
        `🛑 SL moved to TP1 (${event.tp1})`,
        ``,
        `<i>Remaining: 25% position riding to TP3 (${event.tp3})</i>`,
      ].join("\n");
    }

    case "TP3_HIT": {
      const pnl = event.totalBookedPnl != null ? ` (${event.totalBookedPnl > 0 ? "+" : ""}${event.totalBookedPnl.toFixed(2)}%)` : "";
      return [
        `🏆 <b>TP3 HIT: ${event.symbol} — ${direction}</b>`,
        ``,
        `✅ Final 25% booked. Trade fully closed${pnl}`,
        ``,
        `<i>All targets hit. Clean trade.</i>`,
      ].join("\n");
    }

    case "SL_HIT": {
      const pnl = event.totalBookedPnl != null ? ` (${event.totalBookedPnl > 0 ? "+" : ""}${event.totalBookedPnl.toFixed(2)}%)` : "";
      const wasPartialProfit = event.totalBookedPnl != null && event.totalBookedPnl > 0;
      return [
        `🔴 <b>SL HIT: ${event.symbol} — ${direction}</b>`,
        ``,
        wasPartialProfit
          ? `📊 Partial profit secured${pnl}`
          : `❌ Loss${pnl}`,
        `📉 Stopped at ${event.price}`,
        ``,
        `<i>Trade closed.</i>`,
      ].join("\n");
    }

    default:
      return `📢 Signal update: ${event.symbol} — ${event.type}`;
  }
}
