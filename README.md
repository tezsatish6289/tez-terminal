# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Important Note on Exchange Data
This terminal tracks **Binance Global (Binance.com)** prices. It is optimized to fetch data from Global mirrors (like `binance.me`) to ensure Perpetual contracts (.P) and international liquidity are tracked even from US-based servers.

## Security & Privacy (CRITICAL)
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. It is physically impossible for web requests to transmit your MAC address to Binance or any other server.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.

## Step-by-Step Live Deployment (CRITICAL)

Your terminal requires an external "ping" every 5 minutes to update prices and check internal Stop Losses.

1.  **Publish Changes**: Click the **"Publish"** button in the top right to deploy the latest code to your live URL. This is mandatory for the Cron to work!
2.  **Verify Public URL**: Once published, your terminal will be live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
3.  **Setup 24/7 Cron (CRITICAL)**:
    *   **Do NOT use the development URL** (ending in `.cloudworkstations.dev`). It will return a `302 Redirect`.
    *   **Production Endpoint**: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app/api/cron/sync-prices?key=ANTIGRAVITY_SYNC_TOKEN_2024`
    *   **Go to [cron-job.org](https://cron-job.org)**.
    *   Create a job targeting the **Production Endpoint** above.
    *   **Frequency**: Set to "Every 5 minutes".
4.  **Confirm Sync is Working**:
    *   Log in to your terminal at `hello@tezterminal.com`.
    *   Go to **History** -> **System Health**.
    *   Look for logs starting with **"24/7 SYNC"**. If you see these appearing every 5 minutes, your terminal is fully autonomous.

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