'use client';

import { FirebaseApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported, logEvent as fbLogEvent, setUserId, setUserProperties } from 'firebase/analytics';

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

export async function initAnalytics(app: FirebaseApp): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const supported = await isSupported();
      if (!supported) return null;
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    } catch {
      return null;
    }
  })();

  return initPromise;
}

export function getAnalyticsInstance(): Analytics | null {
  return analyticsInstance;
}

function track(eventName: string, params?: Record<string, unknown>) {
  if (!analyticsInstance) return;
  fbLogEvent(analyticsInstance, eventName, params);
}

export function identifyUser(uid: string, properties?: Record<string, string>) {
  if (!analyticsInstance) return;
  setUserId(analyticsInstance, uid);
  if (properties) {
    setUserProperties(analyticsInstance, properties);
  }
}

export function clearUserIdentity() {
  if (!analyticsInstance) return;
  setUserId(analyticsInstance, '');
}

// ─── Landing ────────────────────────────────────────────────────
export function trackSignInClicked() {
  track('sign_in_clicked');
}

// ─── Auth ───────────────────────────────────────────────────────
export function trackLogin(method: string) {
  track('login', { method });
}

export function trackSignUp(method: string) {
  track('sign_up', { method });
}

// ─── Signal interactions ────────────────────────────────────────
export function trackSignalClicked(signalId: string, symbol: string, timeframe: string, side: string) {
  track('signal_clicked', { signal_id: signalId, symbol, timeframe, side });
}

export function trackFilterApplied(filters: { timeframe?: string; side?: string; perf?: string; algo?: string }) {
  track('filter_applied', filters);
}

export function trackTabChanged(tab: string) {
  track('tab_changed', { tab });
}

// ─── Chart ──────────────────────────────────────────────────────
export function trackChartViewed(signalId: string, symbol?: string) {
  track('chart_viewed', { signal_id: signalId, symbol });
}

// ─── Subscription ───────────────────────────────────────────────
export function trackSubscribePageView() {
  track('subscribe_page_view');
}

export function trackPlanSelected(days: number, price: number) {
  track('plan_selected', { days, price });
}

export function trackPaymentInitiated(days: number, price: number, currency: string) {
  track('payment_initiated', { days, price, currency });
}

export function trackPaymentCompleted(days: number, price: number, currency: string) {
  track('payment_completed', { days, price, currency });
}

// ─── Telegram ───────────────────────────────────────────────────
export function trackTelegramConnected() {
  track('telegram_connected');
}

export function trackTelegramEnabled() {
  track('telegram_enabled');
}

// ─── Referrals ──────────────────────────────────────────────────
export function trackReferralLinkCopied() {
  track('referral_link_copied');
}

// ─── Page views (each page gets its own event for easy counting) ─
export function trackLandingPageView() {
  track('landing_page_view');
}

export function trackSignalsPageView() {
  track('signals_page_view');
}

export function trackTradeAuditPageView() {
  track('trade_audit_page_view');
}

export function trackReferralPageView() {
  track('referral_page_view');
}

export function trackPurchasesPageView() {
  track('purchases_page_view');
}

export function trackNotificationsPageView() {
  track('notifications_page_view');
}

// ─── Guide ──────────────────────────────────────────────────────
export function trackGuideOpened() {
  track('guide_opened');
}
