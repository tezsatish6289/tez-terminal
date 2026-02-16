# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Permanent Fix for 451 (Binance Blocks)
If you see `451` errors in your logs, Binance is blocking your US-based server. You must move the server to Asia.

### Step 1: Prepare GitHub
1.  Create a free account at [GitHub.com](https://github.com) if you haven't already.
2.  Create a new repository named `tez-terminal`.
3.  Upload/Push this codebase to that repository.

### Step 2: Migrate Firebase Hosting
1.  Go to your **Firebase Console**.
2.  Navigate to **App Hosting**.
3.  **Delete** the current backend (this only deletes the hosting, not your signals or data).
4.  Click **"Create New Backend"**.
5.  **Region**: Select `asia-south1` (Mumbai) or `asia-southeast1` (Singapore).
6.  **GitHub Connection**: Select the repository you just created (`tez-terminal`).
7.  **Deploy**: Use the `main` branch.

Once deployed in Asia, your 24/7 cron job will never be blocked by Binance Global again.

## Security & Privacy
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. Web requests cannot transmit your MAC address.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.

## 24/7 Autonomy (The Cron Job)
1.  **Production Endpoint**: `https://<YOUR_NEW_ASIA_URL>/api/cron/sync-prices?key=ANTIGRAVITY_SYNC_TOKEN_2024`
2.  **Frequency**: Set to "Every 5 minutes" on `cron-job.org`.
3.  **No Browser Needed**: Once published to Asia, you can turn off your computer. The terminal will track everything in the cloud.