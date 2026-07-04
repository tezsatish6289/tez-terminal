/** Open TradingView full chart — anchor fallback when popups are blocked. */
export function openTradingViewChart(url: string): void {
  const target = url.trim();
  if (!target) return;

  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
    return;
  }

  const link = document.createElement("a");
  link.href = target;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}
