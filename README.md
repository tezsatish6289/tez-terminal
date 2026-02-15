
# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Step-by-Step Deployment Instructions

1.  **Click "Publish"**: Live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
2.  **Schedule the Cron Job (CRITICAL)**:
    *   The terminal uses a backend cron to sync prices 24/7.
    *   Go to **[cron-job.org](https://cron-job.org)** or **Vercel Cron**.
    *   Target URL: `https://YOUR_URL/api/cron/sync-prices`
    *   Interval: **Every 5 minutes**.
3.  **Update TradingView**: 
    *   Go to **Bridge Management** in your app.
    *   Copy the **Public Webhook URL**.
    *   Paste it into your TradingView Alert.

## Recommended Ingestion Format (JSON)
```json
{
  "ticker": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "price": "{{close}}",
  "timeframe": "{{interval}}",
  "secretKey": "YOUR_KEY"
}
```

## Features
- **Server-Driven Prices**: No client-side polling. Data is maintained by a 24/7 cron job.
- **Performance Tracking**: Automatically records Max Upside and Max Drawdown achieved by every signal.
- **Admin Debugger**: Real-time technical logs of all bridge and sync activities.
