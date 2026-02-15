
# TezTerminal Antigravity

Advanced Trading Terminal with TradingView Ingestion Bridge.

## Step-by-Step Deployment Instructions

1.  **Click "Publish"**: Look at the top-right corner of the Firebase Studio screen. Click the blue **"Publish"** button.
2.  **Wait for Deployment**: The system will package your app and push it to a public server. This takes 2-4 minutes.
3.  **Public URL**: Your terminal will be live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
4.  **Update TradingView**: 
    *   Go to **Bridge Management** in your newly deployed app.
    *   Copy the **Public Webhook URL**.
    *   Paste it into your TradingView Alert "Webhook URL" box.

## Expected Ingestion Format (JSON)
The terminal expects the following JSON payload from your indicators:

```json
{
  "ticker": "{{ticker}}",
  "side": "buy",
  "price": "{{close}}",
  "secretKey": "YOUR_KEY",
  "exchange": "{{exchange}}",
  "timeframe": "{{interval}}",
  "note": "TradingView Alert Triggered"
}
```

### Supported Timeframes
The bridge automatically normalizes your intervals. You can send:
- **Minutes**: "1", "5", "15", "60" (for 1h), "240" (for 4h).
- **Daily**: "D", "1D", "Daily".
- **Weekly**: "W", "1W", "Weekly".

## Data Maintenance
If filters are not showing old signals, it is because they were stored in a non-standard format. It is recommended to clear the `signals` collection in the Firebase Console to start a fresh, standardized feed.

## Security
- Bridges are secured via `secretKey` in the JSON payload.
- Admin: Only `hello@tezterminal.com` can manage bridges.
- Ensure the public domain is added to **Authorized Domains** in Firebase Console -> Authentication.
