# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Permanent Fix for 451 (Binance Blocks)
If you see `451` errors in your logs, Binance is blocking your US-based server. You must move the server to Asia.

### Step 1: Create the GitHub Repository
1.  Log in to your GitHub account: `tezsatish6289`.
2.  Go to [github.com/new](https://github.com/new).
3.  Repository Name: `tez-terminal`.
4.  Visibility: **Public**.
5.  Click **"Create repository"**.

### Step 2: Transfer the Code (The "Manual Backup" Method)
Since this environment is separate from your personal GitHub, you must copy the files manually:
1.  In your new GitHub repo, click **"Add file"** > **"Create new file"**.
2.  **For each file below**, copy the code from the editor on the left of your Firebase Studio and paste it into GitHub.

#### 📁 Essential Root Files:
- `package.json`
- `apphosting.yaml`
- `next.config.ts`
- `tailwind.config.ts`
- `tsconfig.json`
- `components.json`

#### 📁 Folders to Mirror:
- `src/` (Copy all subfolders: `app`, `components`, `firebase`, `ai`, `lib`, `hooks`)
- `docs/` (Specifically `backend.json`)

### Step 3: Connect to Asia
1.  Go to the **Firebase Console** (App Hosting section).
2.  Click **"Create App Hosting Backend"**.
3.  Connect your GitHub account and select the `tez-terminal` repository.
4.  **CRITICAL**: Set the **Region** to **`asia-southeast1` (Singapore)**.
5.  Click **"Finish"**.

Once deployed in Asia, your 24/7 cron job will be "unblocked" and run autonomously.

## Security & Privacy
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. Web requests cannot transmit your MAC address.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.
