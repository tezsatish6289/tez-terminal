# TezTerminal - Singapore Migration Guide (CLI)

Since your US-based server is currently blocked by Binance (`451`), you are migrating to **Singapore (asia-southeast1)**. Follow these steps using your Mac Terminal to push your code to your new GitHub account.

### Step 1: Initialize Git on your Mac
Open your **Terminal** app, navigate to your project folder, and run:
```bash
git init
git remote add origin https://github.com/tezsatish6289/tez-terminal.git
git add .
git commit -m "Initial Migration to Asia"
git push -u origin main
```

### Step 2: Critical Files Checklist
Ensure these files are in your GitHub repo before deploying:

**Infrastructure:**
- `apphosting.yaml` (Must be set to `asia-southeast1`)
- `package.json`
- `next.config.ts`

**Core Logic (src/):**
- `src/app/api/cron/sync-prices/route.ts` (The 24/7 Sync Engine)
- `src/app/api/webhook/route.ts` (The Ingestion Bridge)
- `src/firebase/index.ts` (SDK Initialization)

### Step 3: Deploy in Firebase Console
1. Go to **App Hosting** -> **Create New Backend**.
2. Connect your GitHub account (`tezsatish6289`).
3. Select the `tez-terminal` repository.
4. **IMPORTANT**: In the "Region" dropdown, select **asia-southeast1 (Singapore)**.
5. Click **Finish and Deploy**.

Once deployed in Singapore, your terminal will regain 24/7 autonomous access to Binance without regional blocks.
