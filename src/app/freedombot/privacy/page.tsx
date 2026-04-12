import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, Server, Trash2, Mail } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — FreedomBot.ai",
  description: "How FreedomBot.ai collects, encrypts, and protects your data — including full technical details of our API key security model.",
};

const LAST_UPDATED = "12 April 2026";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-10"
      style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <span style={{ color: "#60a5fa" }}>{icon}</span>
        <h2 className="text-lg sm:text-xl font-bold" style={{ color: "#e2e8f0" }}>{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded text-xs font-mono"
      style={{ backgroundColor: "rgba(96,165,250,0.08)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.15)" }}
    >
      {children}
    </code>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{children}</span>;
}

function TechBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4 mt-2 space-y-2 text-xs font-mono leading-relaxed"
      style={{
        backgroundColor: "#060d1a",
        border: "1px solid rgba(96,165,250,0.12)",
        color: "#64748b",
      }}
    >
      {children}
    </div>
  );
}

function BulletRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: "#60a5fa" }}>→</span>
      <span>
        <span style={{ color: "#94a3b8" }}>{label}: </span>
        <span style={{ color: "#60a5fa" }}>{value}</span>
      </span>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.85)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>FreedomBot.ai</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm mb-12 transition-colors hover:text-blue-300 w-fit"
          style={{ color: "#64748b" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
          style={{
            backgroundColor: "rgba(37,99,235,0.1)",
            border: "1px solid rgba(96,165,250,0.2)",
            color: "#93c5fd",
          }}
        >
          <Shield className="h-3 w-3" /> Privacy Policy
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter mb-4 leading-tight">
          Your privacy.{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
          >
            Our obsession.
          </span>
        </h1>

        <p className="text-base sm:text-lg leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
          We hold two things that demand absolute protection: your personal identity and your
          exchange API keys. This document explains exactly what we collect, how we secure it,
          and what we will never do with it — in plain language and with full technical detail.
        </p>

        <p className="text-xs mb-16" style={{ color: "#475569" }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div className="space-y-6">

          {/* 1. What we collect */}
          <Section title="1. What we collect and why" icon={<Eye className="h-5 w-5" />}>
            <P>We collect only what is necessary to operate the platform. Nothing more.</P>

            <div className="space-y-5">
              <div>
                <p className="font-semibold mb-2" style={{ color: "#cbd5e1" }}>Identity (via Google Sign-In)</p>
                <ul className="space-y-1 pl-4">
                  {[
                    "Email address — used to identify your account and send transactional notices",
                    "Display name — shown in your dashboard",
                    "Firebase UID — a unique, opaque identifier that links your account to your data",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span style={{ color: "#60a5fa" }}>·</span> {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
                  We never see your Google password. Authentication is handled entirely by Google Firebase Auth.
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2" style={{ color: "#cbd5e1" }}>Exchange API credentials</p>
                <ul className="space-y-1 pl-4">
                  {[
                    "Your API key and API secret — encrypted immediately on receipt, never stored in plaintext (see Section 3)",
                    "Last 4 characters of your API key — stored unencrypted solely for display purposes in your dashboard",
                    "An HMAC-SHA256 fingerprint of your API key — used to detect duplicate registrations without exposing the key itself",
                    "Exchange name and bot type — to route your bot to the correct trading system",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span style={{ color: "#60a5fa" }}>·</span> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-2" style={{ color: "#cbd5e1" }}>Trade activity</p>
                <ul className="space-y-1 pl-4">
                  {[
                    "Trade records (symbol, direction, PnL, timestamps) — to display your dashboard and maintain on-chain records",
                    "Bot deployment status — to know whether your bot is active or stopped",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span style={{ color: "#60a5fa" }}>·</span> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-2" style={{ color: "#cbd5e1" }}>Waitlist entries (if applicable)</p>
                <ul className="space-y-1 pl-4">
                  {[
                    "Name, email, and optionally phone — encrypted using AES-256-GCM before storage, identical to how API keys are protected",
                    "Country and asset type interest — stored unencrypted for aggregate analytics only (not personally identifiable)",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span style={{ color: "#60a5fa" }}>·</span> {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
                  Decrypted waitlist data is accessible only to verified FreedomBot admins via a token-protected API route. It is used solely to notify you when your requested bot goes live.
                </p>
              </div>
            </div>
          </Section>

          {/* 2. What we never collect */}
          <Section title="2. What we never collect" icon={<Shield className="h-5 w-5" />}>
            <ul className="space-y-2 pl-4">
              {[
                "Your exchange password or 2FA codes — we never ask for these",
                "Withdrawal permissions — our setup guides explicitly instruct you to leave withdrawal access disabled",
                "Your trading capital or funds — your money stays in your exchange account at all times",
                "Browsing history, device fingerprints, or advertising identifiers",
                "Any biometric or government-issued identity data",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span style={{ color: "#ef4444" }}>✕</span> {item}
                </li>
              ))}
            </ul>
            <P>
              FreedomBot operates with <Highlight>read and trade permissions only</Highlight>. It is
              structurally impossible for our system to initiate withdrawals, transfers, or any movement
              of funds out of your exchange account.
            </P>
          </Section>

          {/* 3. API key encryption */}
          <Section title="3. How we encrypt your API keys" icon={<Lock className="h-5 w-5" />}>
            <P>
              This is the most sensitive data we handle. We have designed the encryption pipeline
              so that a complete breach of our database would yield nothing usable.
            </P>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>Algorithm: AES-256-GCM</p>
              <P>
                We use <Highlight>AES-256-GCM</Highlight> (Advanced Encryption Standard, 256-bit key,
                Galois/Counter Mode). GCM is an authenticated encryption mode — it simultaneously
                encrypts the data and produces a cryptographic authentication tag. This means any
                tampering with the stored ciphertext is detected and the decryption is rejected before
                any data is returned.
              </P>
              <TechBox>
                <BulletRow label="Algorithm" value="AES-256-GCM" />
                <BulletRow label="Key size" value="256 bits (32 bytes)" />
                <BulletRow label="IV size" value="128 bits (16 bytes), randomly generated per encryption" />
                <BulletRow label="Auth tag" value="128 bits (16 bytes), appended to ciphertext" />
                <BulletRow label="Storage format" value="base64(IV ‖ AuthTag ‖ Ciphertext)" />
              </TechBox>
            </div>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>Key derivation: scrypt</p>
              <P>
                The encryption key is not used raw. It is derived using{" "}
                <Highlight>scrypt</Highlight>, a memory-hard key derivation function designed to make
                brute-force attacks computationally prohibitive even with specialised hardware. The
                master key is sourced from a server-side environment variable and is never present
                in source code or committed to version control.
              </P>
              <TechBox>
                <BulletRow label="KDF" value="scrypt (Node.js crypto.scryptSync)" />
                <BulletRow label="Input" value="ENCRYPTION_KEY environment variable (≥ 32 chars)" />
                <BulletRow label="Salt" value="application-level fixed salt" />
                <BulletRow label="Output" value="32-byte derived key used as AES-256 key" />
              </TechBox>
            </div>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>Per-encryption random IV</p>
              <P>
                A new 16-byte random Initialization Vector (IV) is generated using a cryptographically
                secure random number generator (<Code>crypto.randomBytes</Code>) for{" "}
                <Highlight>every single encryption call</Highlight>. This means that even if two
                users have identical API keys, their stored ciphertext will be completely different.
                It also means that re-saving the same key produces a different ciphertext each time,
                preventing any pattern analysis on the stored data.
              </P>
            </div>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>What is actually stored in our database</p>
              <P>
                The Firestore document for your credentials contains:
              </P>
              <TechBox>
                <BulletRow label="encryptedKey" value="base64(IV + AuthTag + AES-256-GCM(apiKey))" />
                <BulletRow label="encryptedSecret" value="base64(IV + AuthTag + AES-256-GCM(apiSecret))" />
                <BulletRow label="keyLastFour" value="last 4 characters of API key (plaintext, for UI display only)" />
                <BulletRow label="keyFingerprint" value="HMAC-SHA256(exchange + apiKey) — for duplicate detection only" />
                <BulletRow label="exchange" value="e.g. BYBIT (plaintext)" />
              </TechBox>
              <p className="mt-3 text-xs" style={{ color: "#64748b" }}>
                The plaintext API key and secret exist in memory only for the duration of the
                HTTP request — the time it takes to encrypt them. They are never logged,
                never written to disk, and never transmitted beyond the point of encryption.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>Credential isolation</p>
              <P>
                Credentials are stored in a <Highlight>user-scoped Firestore subcollection</Highlight>:{" "}
                <Code>users/&#123;uid&#125;/secrets/&#123;exchangeDocId&#125;</Code>. Firestore security
                rules ensure that no user can read or write another user&apos;s secrets. Server-side
                routes additionally re-verify the Firebase Auth ID token and scope all queries to the
                authenticated <Code>uid</Code> before any database read or write.
              </P>
            </div>

            <div>
              <p className="font-semibold mb-3" style={{ color: "#cbd5e1" }}>Key verification before storage</p>
              <P>
                Before encrypting and storing your credentials, we make a live call to your exchange
                to verify that the keys are valid and have the correct permissions. If the exchange
                rejects the keys, they are discarded immediately — nothing is written to the database.
              </P>
            </div>
          </Section>

          {/* 4. Where data is stored */}
          <Section title="4. Where your data is stored" icon={<Server className="h-5 w-5" />}>
            <P>
              All user data is stored on <Highlight>Google Firebase / Firestore</Highlight>, hosted on
              Google Cloud infrastructure. Firebase provides encryption at rest and in transit by default
              for all stored documents.
            </P>
            <ul className="space-y-2 pl-4">
              {[
                "Authentication: Firebase Authentication (Google Cloud Identity Platform)",
                "User credentials and deployment records: Google Cloud Firestore",
                "Trade records and simulator state: Google Cloud Firestore",
                "On-chain trade history: Solana blockchain (publicly verifiable, immutable)",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span style={{ color: "#60a5fa" }}>·</span> {item}
                </li>
              ))}
            </ul>
            <P>
              Your encrypted credentials never leave our Firestore database except to be decrypted
              in memory on our own server-side API routes at the moment they are needed to place a
              trade. They are never sent to a third-party service, cached in a CDN, or written to
              any log file.
            </P>
          </Section>

          {/* 5. On-chain records */}
          <Section title="5. On-chain trade records and public data" icon={<Shield className="h-5 w-5" />}>
            <P>
              Every trade our <Highlight>own system</Highlight> closes is permanently written to the{" "}
              <Highlight>Solana blockchain</Highlight>. These are records of FreedomBot&apos;s
              aggregate trading activity — not individual user records. They are public, immutable, and
              verifiable by anyone at{" "}
              <Link href="/records" className="font-semibold hover:text-blue-300 transition-colors" style={{ color: "#60a5fa" }}>
                freedombot.ai/records
              </Link>.
            </P>
            <P>
              On-chain records contain: trade direction (long/short), entry and exit prices,
              profit/loss, and timestamp. They are <Highlight>system-level records only</Highlight> —
              your personal identity, your exchange account, your API keys, your individual trade
              history, and any other personally identifiable information are{" "}
              <Highlight>never written to the blockchain</Highlight>. We deliberately designed it this
              way to give the public full visibility into our system&apos;s performance while maintaining
              complete privacy for every individual user.
            </P>
          </Section>

          {/* 6. Authentication and access control */}
          <Section title="6. Authentication and access control" icon={<Lock className="h-5 w-5" />}>
            <P>
              Every API route that touches user data requires a valid{" "}
              <Highlight>Firebase ID token</Highlight> in the <Code>Authorization: Bearer</Code> header.
              This token is verified server-side using the Firebase Admin SDK before any database
              operation is performed. Tokens are short-lived (one hour) and automatically refreshed
              by the Firebase client SDK.
            </P>
            <P>
              We use <Highlight>Google Sign-In exclusively</Highlight>. We do not implement or store
              passwords. Your authentication is delegated entirely to Google&apos;s identity
              infrastructure, which provides phishing-resistant login, brute-force protection, and
              optional 2FA through your Google account settings.
            </P>
            <P>
              The master <Code>ENCRYPTION_KEY</Code> used to derive the AES-256 key is stored as a
              server-side environment variable (Vercel encrypted environment). It is never exposed to
              the client, never committed to source code, and is accessible only to authenticated
              server-side API processes.
            </P>
          </Section>

          {/* 7. Data sharing */}
          <Section title="7. Data sharing and third parties" icon={<Eye className="h-5 w-5" />}>
            <P>
              We do not sell, rent, or share your personal data with any third party for marketing
              or advertising purposes. Ever.
            </P>
            <P>
              The only third parties that interact with your data:
            </P>
            <ul className="space-y-2 pl-4">
              {[
                "Google Firebase — authentication and database infrastructure",
                "Your chosen exchange (e.g. Bybit) — receives trade orders signed with your API key; they hold your funds and execute trades",
                "Solana blockchain — receives aggregated, anonymised trade records",
                "Vercel — hosts our Next.js application; processes HTTP requests but does not store user data",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span style={{ color: "#60a5fa" }}>·</span> {item}
                </li>
              ))}
            </ul>
          </Section>

          {/* 8. Your rights */}
          <Section title="8. Your rights and controls" icon={<Trash2 className="h-5 w-5" />}>
            <P>You have full control over your data:</P>
            <ul className="space-y-3 pl-4">
              {[
                { action: "Revoke API access instantly", detail: "Delete the API key from your exchange dashboard. This immediately cuts off all trading access — no action needed on our side." },
                { action: "Stop your bot", detail: "Use the Stop Bot button in your dashboard. This marks your deployment as inactive and the bot will place no further trades." },
                { action: "Request data deletion", detail: "Email us at privacy@freedombot.ai and we will permanently delete your account, encrypted credentials, and all associated data within 30 days." },
                { action: "Request a data export", detail: "You can request a copy of all personal data we hold about you by emailing privacy@freedombot.ai." },
              ].map(({ action, detail }) => (
                <li key={action} className="flex gap-2">
                  <span style={{ color: "#60a5fa" }}>·</span>
                  <span><Highlight>{action}</Highlight> — {detail}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* 9. Cookies */}
          <Section title="9. Cookies and tracking" icon={<Eye className="h-5 w-5" />}>
            <P>
              We use a minimal session cookie set by Firebase Auth to persist your login state.
              This cookie contains no personal information — only an opaque session identifier.
            </P>
            <P>
              We do not use advertising cookies, third-party tracking pixels, or analytics
              services that profile individual users. No data from your visit to FreedomBot.ai is
              sold to or shared with advertising networks.
            </P>
          </Section>

          {/* 10. Changes */}
          <Section title="10. Changes to this policy" icon={<Shield className="h-5 w-5" />}>
            <P>
              If we make material changes to this Privacy Policy, we will update the &quot;Last
              updated&quot; date at the top of this page and, where appropriate, notify active users
              by email. Continued use of FreedomBot.ai after changes are posted constitutes
              acceptance of the updated policy.
            </P>
          </Section>

          {/* 11. Contact */}
          <Section title="11. Contact" icon={<Mail className="h-5 w-5" />}>
            <P>
              For any privacy-related questions, data requests, or concerns, contact us at:
            </P>
            <p className="font-semibold" style={{ color: "#60a5fa" }}>privacy@freedombot.ai</p>
            <P>We aim to respond to all privacy enquiries within 5 business days.</P>
          </Section>

        </div>

        {/* Footer note */}
        <p className="text-center mt-12 text-xs" style={{ color: "#334155" }}>
          FreedomBot.ai · Trading involves risk. Past performance does not guarantee future results.
        </p>
      </div>

      {/* Footer */}
      <footer className="py-10" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: "#334155" }}>
            © 2026 FreedomBot.ai
          </p>
          <div className="flex gap-6">
            <Link href="/about" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>About</Link>
            <Link href="/terms" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
