/** Open TradingView full chart in a new tab (keyboard shortcut path). */
export function openTradingViewChart(url: string): void {
  const target = url.trim();
  if (!target) return;
  // Do not pass "noopener" in features — it makes window.open return null even on success.
  window.open(target, "_blank");
}
