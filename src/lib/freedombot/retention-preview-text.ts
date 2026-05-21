/**
 * Plain-text preview of the FreedomBot retention modal (admin hover + tooling).
 * Keep in sync with RetentionInterventionModal copy.
 */

import {
  RETENTION_FALLBACK_P90_DAYS,
  showsPauseRetentionModal,
  type RetentionExchangeStats,
} from "./retention-stats-shared";

export type RetentionPreviewIntent = "pause" | "delete";

export interface RetentionPreviewInput {
  intent: RetentionPreviewIntent;
  exchangeLabel: string;
  runningDays: number;
  lifetimeRealizedPnl: number | null;
  pnlCurrency?: string;
  stats: RetentionExchangeStats | null;
}

function formatPnl(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    signDisplay: "exceptZero",
  });
}

function statParagraph(
  exchangeLabel: string,
  stats: RetentionExchangeStats | null,
): string {
  const p90Days = stats?.p90DaysToSustainedProfit ?? RETENTION_FALLBACK_P90_DAYS;
  const hasComputed =
    stats?.source === "computed" && (stats?.sampleSize ?? 0) > 0;
  const sampleSize = stats?.sampleSize ?? 0;

  if (hasComputed) {
    return `On ${exchangeLabel}, 90% of accounts that reached sustained profit did so within about ${p90Days} days${sampleSize > 0 ? ` (based on ${sampleSize} accounts)` : ""}.`;
  }
  return `Many users on ${exchangeLabel} who keep the bot running past the first few weeks tend to recover from early drawdowns — often around ${p90Days}+ days of runtime.`;
}

function personalParagraph(input: RetentionPreviewInput): string | null {
  const { runningDays, lifetimeRealizedPnl, pnlCurrency = "USDT" } = input;
  if (runningDays <= 0) return null;

  const pnlKnown =
    lifetimeRealizedPnl != null && Number.isFinite(lifetimeRealizedPnl);
  let line = `You've been running for ${runningDays} day${runningDays === 1 ? "" : "s"}`;
  if (pnlKnown && lifetimeRealizedPnl! < 0) {
    line += `; lifetime P&L is ${formatPnl(lifetimeRealizedPnl!)} ${pnlCurrency} — pausing now often locks in losses before the strategy has time to work.`;
  } else if (pnlKnown && lifetimeRealizedPnl! >= 0) {
    line += "; you're currently net positive on closed trades.";
  } else {
    line += ".";
  }
  return line;
}

/** Full modal body the end user sees (plain text). */
export function buildRetentionInterventionPreviewText(
  input: RetentionPreviewInput,
): string {
  const { intent, exchangeLabel, stats } = input;
  const action = intent === "pause" ? "pause" : "delete";
  const reconsider = intent === "pause" ? "pausing" : "leaving";

  const lines = [
    "Hi — I'm FreedomBot",
    `Before you ${action}`,
    "",
    `I want to share something important: ${statParagraph(exchangeLabel, stats)}`,
    "",
    `I only earn when you do — my incentives are aligned with yours. I'd ask you to reconsider ${reconsider} while you're still in the early part of the curve.`,
    "",
    `If you need liquidity, you can partially withdraw on ${exchangeLabel} — your funds stay in your exchange; we never have withdrawal access.`,
  ];

  const personal = personalParagraph(input);
  if (personal) {
    lines.push("", personal);
  }

  if (intent === "delete") {
    lines.push(
      "",
      `Deleting removes your API keys and breaks continuity — you'll need to deploy again and set up new keys on ${exchangeLabel}.`,
    );
  }

  return lines.join("\n");
}

/** Admin pause column — what the user actually sees when they click Pause. */
export function buildPauseRetentionHoverText(
  input: Omit<RetentionPreviewInput, "intent">,
): string {
  if (!showsPauseRetentionModal(input.lifetimeRealizedPnl)) {
    return [
      "Pause retention: not shown",
      "",
      "Lifetime P&L is positive — the user goes straight to pause with no FreedomBot message.",
      "",
      "--- Message shown on DELETE (always) ---",
      "",
      buildRetentionInterventionPreviewText({ ...input, intent: "delete" }),
    ].join("\n");
  }

  return buildRetentionInterventionPreviewText({ ...input, intent: "pause" });
}

export function runningDaysFromFirstDeploy(firstDeployedAt: string | null): number {
  if (!firstDeployedAt) return 0;
  const ms = Date.now() - new Date(firstDeployedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
