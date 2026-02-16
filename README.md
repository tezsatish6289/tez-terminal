# TezTerminal - Singapore Migration Checklist

You have successfully added the configuration files. Now, you must copy the **`src`** folder to make the app functional.

### Step 1: Create these folders in GitHub
Inside your `tez-terminal` repo, create this structure:
- `src/`
  - `ai/` (and its subfolders)
  - `app/` (and its subfolders)
  - `components/` (and its subfolders)
  - `firebase/` (and its subfolders)
  - `hooks/`
  - `lib/`

### Step 2: Critical Files to Copy Now
Open these files in the sidebar and copy their code into your GitHub repo:

**Core Logic:**
1. `src/app/api/cron/sync-prices/route.ts` (The 24/7 Sync Engine)
2. `src/app/api/webhook/route.ts` (The Ingestion Bridge)
3. `src/firebase/index.ts` (Database Connection)

**UI & Pages:**
4. `src/app/page.tsx` (Terminal Home)
5. `src/app/history/page.tsx` (System Audit)
6. `src/app/analytics/page.tsx` (Performance Node)
7. `src/components/dashboard/SignalHistory.tsx` (The Live Stream)

### Step 3: Finalize Deployment
1. Go back to the **Firebase Console** -> **App Hosting**.
2. Click **"Refresh"** on your GitHub connection.
3. Once all files (including the `src` folder) are in GitHub, click **"Finish and Deploy"**.
4. **IMPORTANT**: Ensure the region is set to **Singapore (asia-southeast1)**.

### Why this works:
Once the code is in Singapore, your `sync-prices` cron job will no longer see "451 Region Block" errors because Singapore is an approved region for Binance API access.