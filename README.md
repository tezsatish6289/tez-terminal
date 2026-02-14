# TezTerminal Antigravity

Advanced Trading Terminal with TradingView Ingestion Bridge.

## Step-by-Step Deployment Instructions (No GitHub Required)

1.  **Click Deploy**: In the sidebar of this editor, click the **"Deploy"** button.
2.  **Wait**: The system will package your app and push it to a public server. This takes 2-4 minutes.
3.  **Find Public URL**: After deployment, a public URL will appear in the deployment logs (e.g., `https://studio-xxxx.web.app`).
4.  **Update TradingView**: 
    *   Go to **Bridge Management** in your newly deployed app.
    *   Copy the **Public Webhook URL**.
    *   Paste it into your TradingView Alert "Webhook URL" box.
5.  **Test**: Trigger an alert in TradingView and watch the **History** page in your live app.

## Ingestion Format
The bridge expects JSON with `ticker`, `side`, and `secretKey`. 
Example:
```json
{
  "ticker": "{{ticker}}",
  "side": "buy",
  "secretKey": "YOUR_KEY"
}
```

## Security
- Bridges are secured via `secretKey` in the JSON payload.
- Admin: Only `hello@tezterminal.com` can manage bridges.
