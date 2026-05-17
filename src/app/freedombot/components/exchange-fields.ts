/**
 * Shared per-exchange credential-form configuration for the FreedomBot
 * crypto bot. Both the initial deploy flow (`DeployModal`) and the
 * in-dashboard "Update API key" form (`BotSettings`) import from here
 * so the two forms can never drift out of sync — same field set, same
 * placeholders, same help text per venue.
 *
 * NOTE: Indian-stocks exchange defs still live inside DeployModal for
 * now; only the crypto venues are shared.
 */

export interface ExchangeFieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  hint?: string;
}

export interface ExchangeDef {
  key: string;
  name: string;
  icon: string;
  logo?: string;
  access?: string;
  fields: ExchangeFieldDef[];
}

export interface HelpGuide {
  url: string;
  urlLabel: string;
  steps: string[];
  warning: string;
}

export const CRYPTO_EXCHANGE_DEFS: ExchangeDef[] = [
  {
    key: "BYBIT",
    name: "Bybit",
    icon: "🟡",
    logo: "/freedombot/exchanges/bybit.png",
    access: "Global",
    fields: [
      { key: "apiKey", label: "API Key", type: "text", placeholder: "Your Bybit API Key" },
      { key: "apiSecret", label: "API Secret", type: "password", placeholder: "Your Bybit API Secret" },
    ],
  },
  {
    key: "COINDCX",
    name: "CoinDCX",
    icon: "🇮🇳",
    logo: "/freedombot/exchanges/coindcx.png",
    access: "India only",
    fields: [
      { key: "apiKey", label: "API Key", type: "text", placeholder: "Your CoinDCX API Key" },
      { key: "apiSecret", label: "API Secret", type: "password", placeholder: "Your CoinDCX API Secret" },
    ],
  },
  {
    key: "HYPERLIQUID",
    name: "Hyperliquid",
    icon: "◈",
    logo: "/freedombot/exchanges/hyperliquid.png",
    access: "Global",
    fields: [
      {
        key: "apiKey",
        label: "Main wallet (0x…)",
        type: "text",
        placeholder: "0x… your main Hyperliquid wallet (public address)",
        hint: "Same wallet you use to log in on app.hyperliquid.xyz — not the agent row from the API table.",
      },
      {
        key: "apiSecret",
        label: "Agent private key",
        type: "password",
        placeholder: "0x + 64 hex characters (private key from Generate)",
        hint: "Must be 66 chars with 0x (64 hex). Not the “API Wallet Address” shown in the list — that is public. If you only ever saw a short 0x address, create a new agent with Generate and copy the long secret when it appears.",
      },
    ],
  },
];

export const CRYPTO_HELP_GUIDES: Record<string, HelpGuide> = {
  COINDCX: {
    url: "https://coindcx.com/profile",
    urlLabel: "Open CoinDCX Profile",
    steps: [
      "Log in to CoinDCX and go to your Profile.",
      'Click on "API Dashboard" from the profile menu.',
      'Click "Create New" to generate a new API key.',
      'In the Label field, enter a name like "FreedomBot".',
      'Leave "Bind IP Address to API key" unchecked.',
      "Enter the OTP sent to you by CoinDCX and click Create.",
      "Copy and paste the API Key and Secret Key into the fields above.",
      "Make sure your Futures account is funded before starting the bot.",
    ],
    warning:
      "Keep your API Secret safe — it may only be shown once. FreedomBot only needs trading access; your funds stay in your CoinDCX account at all times.",
  },
  BYBIT: {
    url: "https://www.bybit.com/app/user/api-management",
    urlLabel: "Open Bybit API Management",
    steps: [
      "Log in to Bybit.com and click your profile icon (top right).",
      'Go to "Account" → "API Management" from the menu.',
      'Click "Create New Key" — a popup will appear asking you to choose a key type.',
      'Select "System-generated API Keys" (the first option — uses HMAC encryption, simpler to use).',
      'On the next screen, under "API Key Usage" select "API Transaction".',
      'Add a remark/name for your key (e.g. FreedomBot) so you can identify it later.',
      'Set "API Key Permissions" to "Read-Write".',
      'Scroll down to "Trade" permissions. Under "Unified Trading", tick "Orders" and "Positions". Leave everything else unchecked.',
      'Make sure "No IP restriction" is selected (or add our server IP if provided).',
      "Click Submit and complete the 2FA verification (SMS or authenticator app).",
      "Copy your API Key and Secret Key immediately — the secret is shown only once and cannot be recovered.",
    ],
    warning:
      'Never enable any "Withdraw" or "Transfer" permissions. FreedomBot only needs Orders and Positions access — your funds cannot be moved.',
  },
  HYPERLIQUID: {
    url: "https://app.hyperliquid.xyz/API",
    urlLabel: "Open Hyperliquid → API (agent wallets)",
    steps: [
      "Log in to Hyperliquid in your browser with your normal trading wallet (this is your main account). Open the API page using the link below (menu: More → API, or the URL directly).",
      "Create an API wallet (Hyperliquid calls this an agent). In the form: enter a Name (e.g. freedombot). For Address, click Generate to create a new agent unless you already use a specific agent address you control.",
      "Click Authorize API Wallet. Your main wallet will ask you to sign once in the wallet popup. Approve it — this attaches the agent to your account. Agents can trade for you but cannot withdraw funds.",
      "Copy the agent private key as soon as it appears. Right after Generate / authorize, Hyperliquid may show a secret key: 0x followed by 64 hex characters (66 characters total including 0x). That value is your API Secret in FreedomBot. Save it immediately — you may not see it again. If you never saw a long hex string, you only have the public address; in that case Remove the agent on Hyperliquid, create a new one with Generate, and watch for the reveal step.",
      "Do not confuse two different 0x strings. The table on the API page lists each agent’s public address (short, 42-character 0x…). FreedomBot does not use that as the secret. The secret is the private key from the previous step (long hex). Pasting the table address into API Secret will not work.",
      "Main wallet (API Key): Paste your main account’s public address — the same wallet you use on Hyperliquid and the same one their docs mean for info / account queries (usually visible in the top bar or your wallet app).",
      "Agent private key (API Secret): Paste the full 0x + 64 hex private key you saved when Hyperliquid revealed it. FreedomBot uses it only to sign orders for your main account on Hyperliquid’s API.",
      "Fund perps: Move USDC into your perpetual balance on Hyperliquid so the bot can post margin. Orders below the venue minimum (often about $10 notional) are rejected — keep a sensible buffer.",
      "Paste main address and agent private key below, then continue. If verification fails, re-read the steps about the table vs the private key — that mix-up is the most common mistake.",
    ],
    warning:
      "Never paste your main wallet **seed phrase** anywhere. The agent private key is as sensitive as a password — store it in a password manager. If an agent is ever exposed, open Hyperliquid → API and **Remove** it, then create a new agent and new keys.",
  },
};

export function getCryptoExchangeDef(key: string): ExchangeDef | null {
  return CRYPTO_EXCHANGE_DEFS.find((e) => e.key === key) ?? null;
}

export function getCryptoHelpGuide(key: string): HelpGuide | null {
  return CRYPTO_HELP_GUIDES[key] ?? null;
}
