# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Important Note on Exchange Data
This terminal tracks **Binance Global (Binance.com)** prices. It is optimized to fetch data from Global mirrors (like `binance.me`) to ensure Perpetual contracts (.P) and international liquidity are tracked even from US-based servers.

## Security & Privacy
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. Web requests cannot transmit your MAC address.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.

## 24/7 Autonomy (The Cron Job)
Your terminal is designed to be fully autonomous. The **Cron Job** you set up at `cron-job.org` is the "heartbeat" of the system.

1.  **How it works**: Every 5 minutes, `cron-job.org` pings your Production Endpoint.
2.  **What it does**: It triggers the "Server Sync" logic, which updates all active signal prices and checks if any Stop Losses have been hit.
3.  **No Browser Needed**: Once the cron is active, you can close your browser and turn off your computer. The terminal will continue to track performance in the cloud.

## Step-by-Step Live Deployment (CRITICAL)

1.  **Publish Changes**: Click the **"Publish"** button in the top right to deploy the latest code to your live URL.
2.  **Verify Public URL**: Once published, your terminal will be live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
3.  **Setup 24/7 Cron**:
    *   **Production Endpoint**: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app/api/cron/sync-prices?key=ANTIGRAVITY_SYNC_TOKEN_2024`
    *   **Go to [cron-job.org](https://cron-job.org)** and create a job targeting this URL.
    *   **Frequency**: Set to "Every 5 minutes".
4.  **Confirm Sync**:
    *   Go to **History** -> **System Health**.
    *   Look for **"24/7 SYNC SUCCESS"** logs. These indicate the automated cron job is working.
