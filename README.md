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

### Step 2: Push Code to GitHub (Mac Terminal)
If you have the files on your Mac, open the **Terminal** app and run these commands:

```bash
# 1. Go to your project folder
cd /path/to/your/tez-terminal-folder

# 2. Initialize Git
git init

# 3. Add your GitHub repository as the destination
git remote add origin https://github.com/tezsatish6289/tez-terminal.git

# 4. Stage all files
git add .

# 5. Commit the changes
git commit -m "Initial migration to Asia server"

# 6. Push to GitHub
git branch -M main
git push -u origin main
```

**Note:** If you don't have the files locally yet, the easiest way is to use the "Add file" > "Upload files" button on the GitHub website and drag-and-drop your project folders there.

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
