# TezTerminal Antigravity

Advanced Trading Terminal with TradingView Ingestion Bridge.

## Deployment Instructions

1.  **Deploy to Firebase**: Click the "Deploy" button in the Firebase Studio sidebar.
2.  **Get Public URL**: Once deployed, Firebase will provide a public domain (e.g., `https://my-app.web.app`).
3.  **Update TradingView**: 
    *   Go to **Bridge Management** in your deployed app.
    *   Copy the **Webhook URL** (it will now use your public domain).
    *   Paste it into your TradingView Alert "Webhook URL" box.
4.  **Confirm Hits**: Check the **History** page in the live app to see real-time signals.

## Technical Notes
- **Ingestion**: External POST requests are handled via `/api/webhook`.
- **Security**: Bridges are secured via `secretKey` in the JSON payload.
- **Admin**: Only `hello@tezterminal.com` can manage bridges.
