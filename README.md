# TezTerminal Antigravity - Migration Guide

Since your US-based server is blocked by Binance (`451` errors), follow these steps to move the terminal to **Singapore** or **Mumbai**.

## Step 1: Prepare your Mac
1. Create a new folder on your Desktop named `tez-terminal`.
2. Inside that folder, create the following files by copying the code from the **Firebase Studio sidebar**:
   - `package.json`
   - `apphosting.yaml`
   - `next.config.ts`
   - `tailwind.config.ts`
   - `tsconfig.json`
   - `src/` (Mirror the entire folder structure and all files inside)
   - `.env` (If you have any secrets)

## Step 2: Push to GitHub (Mac Terminal)
Open the **Terminal** app on your Mac and run these commands:

```bash
# 1. Navigate to your project folder
cd ~/Desktop/tez-terminal

# 2. Initialize Git
git init

# 3. Connect to your new GitHub repo
git remote add origin https://github.com/tezsatish6289/tez-terminal.git

# 4. Add and commit files
git add .
git commit -m "Migration to Asia server"

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Recreate Backend in Asia
1. Go to the **Firebase Console** > **App Hosting**.
2. Click **"Create App Hosting Backend"**.
3. Connect your GitHub account and select `tezsatish6289/tez-terminal`.
4. **CRITICAL**: Set the **Region** to **`asia-southeast1` (Singapore)**.
5. Click **"Finish"**.

## Security & Privacy
*   **MAC Address**: Hardware identifiers are never transmitted.
*   **IP Protection**: Your personal IP is hidden during 24/7 syncs. Only the Firebase Server IP in Singapore will be visible to Binance.
