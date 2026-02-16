
# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Step-by-Step Live Deployment (IMPORTANT)

1.  **Publish Changes**: Click the "Publish" button in the top right to deploy the latest code.
2.  **Verify Public URL**: Once published, your terminal will be live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
3.  **Setup 24/7 Cron (CRITICAL)**:
    *   The terminal requires a "ping" every 5 minutes to update prices and check internal Stop Losses.
    *   **Secure Endpoint**: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app/api/cron/sync-prices?key=ANTIGRAVITY_SYNC_TOKEN_2024`
    *   **Go to [cron-job.org](https://cron-job.org)**.
    *   Create a job targeting the **Secure Endpoint** above.
    *   **Frequency**: Every 5 minutes.
4.  **Connect TradingView**:
    *   Go to **Bridge Management** in your app (hello@tezterminal.com only).
    *   Copy your **Bridge URL** and **Secret Key**.
    *   Paste into your TradingView Alert "Webhook URL" and JSON payload.

## Recommended Ingestion Format (JSON)
```json
{
  "ticker": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "price": "{{close}}",
  "stopLoss": "{{strategy.order.stoploss}}",
  "timeframe": "{{interval}}",
  "secretKey": "YOUR_UNIQUE_BRIDGE_KEY",
  "exchange": "BINANCE",
  "assetType": "CRYPTO"
}
```

## Production Architecture
- **Automatic Lifecycle**: Signals that hit their internal Stop Loss are automatically retired from the feed to save processing costs.
- **Self-Healing Nodes**: The Sync Engine automatically repairs legacy signals that are missing technical metadata.
- **Security Hardening**: The Sync Cron is protected by a mandatory authorization token to prevent unauthorized execution.
- **Deep Dive AI**: Integrated Gemini AI provides deep technical rationale and risk assessment for every signal.
