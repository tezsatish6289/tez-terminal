# TezTerminal - Singapore Migration Guide (Zero-Copy)

Your US-based server is currently blocked by Binance (`451`). We are migrating to **Singapore (asia-southeast1)** to restore 24/7 autonomous sync.

### The "IDE Pipe" Workflow
You don't need to manually copy folders if you use the built-in "Publish" button.

1. **GitHub Setup**: You have already added the config files to `tezsatish6289/tez-terminal`. This is enough for Firebase to "see" the project.
2. **Firebase Connection**: 
   - Go to **App Hosting** in the Firebase Console.
   - Select your repository.
   - **CRITICAL**: Select **asia-southeast1 (Singapore)** as the region.
3. **The Push**: Click the **Publish** button in this IDE. This is your "Pipe"—it will push all remaining folders (including `src`) to your GitHub repo.
4. **Deploy**: Firebase will detect the new code and start the build in Singapore.

### Critical Files Checklist
These are already prepared in your `src` folder:
- `src/app/api/cron/sync-prices/route.ts`: Optimized for Asian Binance mirrors.
- `src/app/api/webhook/route.ts`: Ingestion bridge for TradingView.
- `apphosting.yaml`: Configured for Singapore residency.

Once the deployment finishes in Singapore, your terminal will regain 24/7 access to Binance without regional blocks.
