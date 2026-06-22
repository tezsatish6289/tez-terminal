import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  levelsBubblesPagePathForHost,
  levelsChartPagePathForHost,
} from "@/lib/levels/levels-chart-url";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

const FNONINJA_LEVELS_HOSTS = new Set(["fnoninja.com", "www.fnoninja.com"]);

export type LevelsShareContext = {
  shareUrl: string;
  title: string;
  text: string;
  fileName: string;
};

function shareOrigin(hostname: string): string {
  const h = hostname.toLowerCase();
  if (FNONINJA_LEVELS_HOSTS.has(h)) return FNONINJA_SITE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return FNONINJA_SITE_URL;
}

function fmtInr(p: number): string {
  return p >= 1000
    ? `₹${Math.round(p).toLocaleString("en-IN")}`
    : `₹${p.toLocaleString("en-IN", {
        minimumFractionDigits: p < 10 ? 2 : 0,
        maximumFractionDigits: p < 10 ? 2 : 0,
      })}`;
}

function levelsSummary(levels: PublicLevels | null | undefined): string | null {
  if (!levels) return null;
  const parts: string[] = [];
  if (levels.bullLow != null && levels.bullHigh != null) {
    parts.push(`Support ${fmtInr(levels.bullLow)}–${fmtInr(levels.bullHigh)}`);
  }
  if (levels.bearLow != null && levels.bearHigh != null) {
    parts.push(`Resistance ${fmtInr(levels.bearLow)}–${fmtInr(levels.bearHigh)}`);
  }
  if (levels.poc != null) parts.push(`Max Pain ${fmtInr(levels.poc)}`);
  if (levels.spot != null) parts.push(`Spot ${fmtInr(levels.spot)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildSymbolChartShareUrl(
  hostname: string,
  scope: LevelsTvScope,
  symbol: string,
  expiryKey?: string | null,
): string {
  const origin = shareOrigin(hostname);
  const path = levelsChartPagePathForHost(hostname, scope, symbol, expiryKey);
  if (path.startsWith("http")) return path;
  return `${origin}${path}`;
}

export function buildMarketMapShareUrl(hostname: string): string {
  const origin = shareOrigin(hostname);
  const path = levelsBubblesPagePathForHost(hostname);
  if (path.startsWith("http")) return path;
  return `${origin}${path}`;
}

export function buildSymbolChartShareContext(opts: {
  hostname: string;
  scope: LevelsTvScope;
  symbol: string;
  label?: string | null;
  levels?: PublicLevels | null;
  expiryKey?: string | null;
}): LevelsShareContext {
  const sym = opts.symbol.trim().toUpperCase();
  const shareUrl = buildSymbolChartShareUrl(
    opts.hostname,
    opts.scope,
    sym,
    opts.expiryKey,
  );
  const name =
    opts.label && opts.label.toUpperCase() !== sym ? ` (${opts.label})` : "";
  const summary = levelsSummary(opts.levels);
  const title = `${sym}${name} — option-chain zones | FNONINJA`;
  const text = summary
    ? `${sym}${name}: ${summary}. View live chart on FNONINJA: ${shareUrl}`
    : `${sym}${name} option-chain support, resistance, and OI zones on FNONINJA: ${shareUrl}`;

  return {
    shareUrl,
    title,
    text,
    fileName: `fnoninja-${sym.toLowerCase()}-chart.png`,
  };
}

export function buildMarketMapShareContext(opts: {
  hostname: string;
  viewLabel?: string;
}): LevelsShareContext {
  const shareUrl = buildMarketMapShareUrl(opts.hostname);
  const view = opts.viewLabel ? ` (${opts.viewLabel})` : "";
  const title = `NSE F&O Market Map${view} | FNONINJA`;
  const text = `Explore option-chain derived support and resistance across NSE F&O stocks and indices on FNONINJA: ${shareUrl}`;

  return {
    shareUrl,
    title,
    text,
    fileName: "fnoninja-market-map.png",
  };
}

export { fmtInr, levelsSummary };
