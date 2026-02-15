
# TezTerminal Antigravity

Advanced Trading Terminal with Robust TradingView Ingestion.

## Step-by-Step Deployment Instructions

1.  **Click "Publish"**: Look at the top-right corner of the Firebase Studio screen.
2.  **Public URL**: Your terminal will be live at: `https://studio--studio-6235588950-a15f2.us-central1.hosted.app`
3.  **Update TradingView**: 
    *   Go to **Bridge Management** in your app.
    *   Copy the **Public Webhook URL**.
    *   Paste it into your TradingView Alert.

## Recommended Ingestion Format (JSON)
The bridge is fuzzy and handles most common keys, but for best results, use:

```json
{
  "ticker": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "price": "{{close}}",
  "timeframe": "{{interval}}",
  "secretKey": "YOUR_KEY"
}
```

### Supported Auto-Normalization
- **Price**: Handles `price`, `close`, `price_at_alert`, or `entry`.
- **Timeframe**: Automatically maps `1H`, `Daily`, `5m`, etc., to canonical terminal values.
- **Symbol**: Handles `ticker`, `symbol`, `pair`, or `asset`.

## Security
- Bridges are secured via `secretKey` in the JSON payload.
- Admin: Only `hello@tezterminal.com` can manage bridges.
