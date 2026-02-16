# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion and 24/7 Automated Performance Tracking.

## Permanent Fix for 451 (Binance Blocks)
If you see `451` errors in your logs, Binance is blocking your US-based server. You must move the server to Asia (Singapore/Mumbai).

### Step 1: Create the GitHub Repository
1.  Log in to your GitHub account: `tezsatish6289`.
2.  Go to [github.com/new](https://github.com/new).
3.  Repository Name: `tez-terminal`.
4.  Visibility: **Public**.
5.  Click **"Create repository"**.

### Step 2: Transfer the Code (The "Manual Mirror" Method)
Since I cannot generate a ZIP file, you must mirror the files manually. In your new GitHub repo, click **"Add file"** > **"Create new file"** for each of these:

#### 📁 Essential Root Files:
- `package.json`
- `apphosting.yaml`
- `next.config.ts`
- `tailwind.config.ts`
- `tsconfig.json`
- `components.json`
- `firestore.rules`

#### 📁 Folders to Copy:
- All files inside `src/app/` (including subfolders like `api/`, `chart/`, etc.)
- All files inside `src/components/`
- All files inside `src/firebase/`
- All files inside `src/ai/`
- All files inside `src/lib/`
- All files inside `src/hooks/`
- The file `docs/backend.json`

### Step 3: Deploy to Asia
1.  Go to the **Firebase Console** > **App Hosting**.
2.  Click **"Create App Hosting Backend"**.
3.  Connect your GitHub account and select the `tez-terminal` repository.
4.  **CRITICAL**: Set the **Region** to **`asia-southeast1` (Singapore)** or **`asia-south1` (Mumbai)**.
5.  Click **"Finish"**.

## Security & Privacy
*   **MAC Address**: Your hardware MAC address is **NEVER** exposed. Web requests cannot transmit your MAC address.
*   **IP Exposure**: During automated 24/7 syncs, only the **Firebase Server IP** is visible to Binance. Your personal IP remains private. 
*   **Data Integrity**: Your unique `secretKey` ensures that only your authorized TradingView alerts can enter the terminal.
