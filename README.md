# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Permanent Fix for 451 (Binance Blocks)
If you see `451` errors in your logs, Binance is blocking your US-based server. You must move the server to Asia.

### Step 1: Create the GitHub Repository
1.  Log in to your new GitHub account: `tezsatish6289`.
2.  Go to [github.com/new](https://github.com/new).
3.  Repository Name: `tez-terminal`.
4.  Visibility: **Public**.
5.  Click **"Create repository"**.

### Step 2: Upload Files
1.  In your new repository, look for the text: "Quick setup — if you’ve done this kind of thing before" or simply find the **"uploading an existing file"** link.
2.  Download or copy the files from this Firebase Studio environment and upload them to your repository.
3.  **Crucial Files**: Ensure `package.json`, `apphosting.yaml`, `next.config.ts`, and the `src` folder are all present.

### Step 3: Connect to Asia
1.  Go back to the **Firebase Console** (the screen in your screenshot).
2.  Click **"Refresh list"**.
3.  Select the `tez-terminal` repository.
4.  **Region**: Ensure you have selected **`asia-southeast1` (Singapore)** or **`asia-south1` (Mumbai)**.
5.  **Deploy**: Click "Finish" or "Deploy".

Once deployed in Asia, your 24/7 cron job will never be blocked by Binance Global again.

## Security & Privacy
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. Web requests cannot transmit your MAC address.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.
