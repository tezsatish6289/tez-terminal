import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, FileText, AlertTriangle, Shield, Lock, Ban, DollarSign, Settings, Zap, Scale, RefreshCw, Mail } from "lucide-react";

export const metadata = {
  title: "Terms of Use — FreedomBot.ai",
  description: "Terms of Use for FreedomBot.ai — read before deploying an automated trading bot.",
};

const LAST_UPDATED = "12 April 2026";

function Section({ title, icon, children, highlight }: { title: string; icon: React.ReactNode; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-10"
      style={{
        backgroundColor: "#0a1628",
        border: `1px solid ${highlight ? "rgba(251,191,36,0.25)" : "rgba(90,140,220,0.15)"}`,
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <span style={{ color: highlight ? "#fbbf24" : "#60a5fa" }}>{icon}</span>
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

function Highlight({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{children}</span>;
}

function Bullet({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span style={{ color: "#60a5fa" }}>·</span> {item}
        </li>
      ))}
    </ul>
  );
}

function Prohibited({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span style={{ color: "#ef4444" }}>✕</span> {item}
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
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
          <FileText className="h-3 w-3" /> Terms of Use
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter mb-4 leading-tight">
          Terms of{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
          >
            Use
          </span>
        </h1>

        <p className="text-base sm:text-lg leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
          Please read these terms carefully before using FreedomBot.ai. By accessing the
          platform or deploying a bot, you agree to be bound by them.
        </p>

        <p className="text-xs mb-16" style={{ color: "#475569" }}>
          Last updated: {LAST_UPDATED} · Operated by FreedomBot.ai
        </p>

        <div className="space-y-6">

          {/* 1. Acceptance */}
          <Section title="1. Acceptance of terms" icon={<FileText className="h-5 w-5" />}>
            <P>
              By accessing <Highlight>freedombot.ai</Highlight>, creating an account, or deploying
              a bot, you confirm that you have read, understood, and agree to these Terms of Use
              and our{" "}
              <Link href="/privacy" className="font-semibold hover:text-blue-300 transition-colors" style={{ color: "#60a5fa" }}>
                Privacy Policy
              </Link>.
              If you do not agree, please do not use the platform.
            </P>
            <P>
              FreedomBot.ai is operated by a registered company in India
              (referred to as &quot;FreedomBot&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
            </P>
          </Section>

          {/* 2. What FreedomBot is */}
          <Section title="2. What FreedomBot is — and is not" icon={<Settings className="h-5 w-5" />}>
            <P>
              FreedomBot.ai is an <Highlight>automated trading tool</Highlight>. It connects to
              your exchange account via API keys and places trades on your behalf according to a
              rule-based strategy.
            </P>
            <P>FreedomBot is <Highlight>not</Highlight>:</P>
            <Prohibited items={[
              "A financial advisor, investment manager, or portfolio manager",
              "A broker, dealer, or exchange",
              "A custodian — we never hold, control, or have access to your funds",
              "A guarantee of profit or returns of any kind",
            ]} />
            <P>
              The strategy we deploy is designed with risk management and long-term capital growth
              in mind. Our fee model is tied to your profit — we genuinely want you to win. However,
              all trading involves risk and outcomes cannot be guaranteed.
            </P>
          </Section>

          {/* 3. Eligibility */}
          <Section title="3. Eligibility" icon={<Shield className="h-5 w-5" />}>
            <P>
              To use FreedomBot.ai you must:
            </P>
            <Bullet items={[
              "Meet the minimum age requirement set by your chosen exchange or broker (typically 18 years)",
              "Be legally permitted to trade financial instruments in your jurisdiction",
              "Have a valid account on a supported exchange (e.g. Bybit) with trading permissions enabled",
              "Provide accurate information when creating your account",
            ]} />
            <P>
              You are responsible for ensuring that automated trading is permitted under the laws
              of your country. FreedomBot.ai does not make representations about legal compliance
              in any specific jurisdiction.
            </P>
          </Section>

          {/* 4. Financial risk — highlighted */}
          <Section title="4. Financial risk disclaimer" icon={<AlertTriangle className="h-5 w-5" />} highlight>
            <P>
              Trading financial markets carries significant risk. You can lose some or all of
              the capital you deploy. Past performance — including any results shown on our
              Performance page — <Highlight>does not guarantee future results</Highlight>.
            </P>
            <P>
              FreedomBot uses disciplined risk management: position sizes are kept small (1% of
              capital by default), stop-losses are set on every trade, and leverage is capped at
              10×. Our pricing is designed so that we earn only when you earn — our incentives
              are aligned with your success.
            </P>
            <P>
              Despite this, markets are unpredictable. Losses are a normal part of trading and
              will occur. You should only deploy capital you can afford to lose, and you should
              not use FreedomBot.ai as your sole financial plan.
            </P>
            <P>
              <Highlight>FreedomBot.ai accepts no liability for trading losses</Highlight>,
              missed opportunities, or any financial outcome resulting from the operation of
              the bot. By deploying, you acknowledge that you have read and understood this risk.
            </P>
          </Section>

          {/* 5. No financial advice */}
          <Section title="5. No financial advice" icon={<Ban className="h-5 w-5" />}>
            <P>
              Nothing on FreedomBot.ai — including the Performance page, the FAQ, the About page,
              or any communication from us — constitutes financial, investment, or trading advice.
            </P>
            <P>
              All content is provided for informational purposes only. We encourage you to do
              your own research and, if appropriate, consult a qualified financial advisor before
              deploying capital.
            </P>
          </Section>

          {/* 6. Your account and API keys */}
          <Section title="6. Your account and API key responsibilities" icon={<Lock className="h-5 w-5" />}>
            <P>You are responsible for:</P>
            <Bullet items={[
              "Maintaining the security of your FreedomBot.ai account credentials",
              "Ensuring your exchange API keys are created with only the permissions FreedomBot requires (read + trade only — never withdrawal)",
              "Revoking your API key from your exchange immediately if you suspect it has been compromised",
              "Keeping your exchange account in good standing with sufficient margin to support bot activity",
              "Not sharing your FreedomBot.ai account with any other person",
            ]} />
            <P>
              FreedomBot encrypts your API keys using AES-256-GCM before storage and never
              transmits them to third parties. However, the security of your exchange account
              itself — including your exchange login credentials and 2FA — remains entirely
              your responsibility.
            </P>
          </Section>

          {/* 7. No custody of funds */}
          <Section title="7. No custody of your funds" icon={<Shield className="h-5 w-5" />}>
            <P>
              FreedomBot.ai operates on a <Highlight>non-custodial model</Highlight>. Your capital
              stays in your exchange account at all times. We never receive, hold, transfer, or
              have access to your funds.
            </P>
            <P>
              FreedomBot connects to your exchange using API keys that are restricted to read and
              trade permissions only. It is structurally impossible for FreedomBot to initiate
              withdrawals or move funds out of your account. You can verify this by reviewing the
              permissions on your API key in your exchange dashboard at any time.
            </P>
          </Section>

          {/* 8. Prohibited uses */}
          <Section title="8. Prohibited uses" icon={<Ban className="h-5 w-5" />}>
            <P>You agree not to:</P>
            <Prohibited items={[
              "Provide false, misleading, or fraudulent information when creating your account or submitting API credentials",
              "Attempt to reverse-engineer, copy, or replicate FreedomBot's trading strategy or algorithms",
              "Use the platform in a way that could harm, overload, or disrupt our systems",
              "Register multiple accounts to circumvent restrictions or fees",
              "Use FreedomBot.ai for money laundering, market manipulation, or any unlawful purpose",
              "Share your account access with any other person or entity",
              "Attempt to access other users' accounts, data, or credentials",
            ]} />
          </Section>

          {/* 9. Fees and PostPay */}
          <Section title="9. Fees" icon={<DollarSign className="h-5 w-5" />}>
            <P>
              <Highlight>Self-deploy is currently free.</Highlight> There are no upfront charges,
              subscription fees, or hidden costs for deploying and running the Crypto Bot.
            </P>
            <P>
              A <Highlight>PostPay plan</Highlight> is coming soon. Under PostPay, FreedomBot
              charges <Highlight>10% of your net profit</Highlight>, calculated after broker and
              exchange fees. You pay only after you earn — there is no charge in a period where
              the bot makes no net profit.
            </P>
            <P>
              When PostPay launches, specific billing terms, calculation methodology, and payment
              timelines will be published and you will be asked to accept them separately before
              enrolment. PostPay fees are non-refundable once charged, as they reflect profit
              already realised in your exchange account.
            </P>
            <P>
              All exchange trading fees (e.g. Bybit maker/taker fees) are incurred directly in
              your account and are separate from FreedomBot&apos;s fees.
            </P>
          </Section>

          {/* 10. Intellectual property */}
          <Section title="10. Intellectual property" icon={<Zap className="h-5 w-5" />}>
            <P>
              All trading strategies, algorithms, signal logic, risk management systems, software,
              branding, and content on FreedomBot.ai are the exclusive intellectual property of
              FreedomBot.ai and its operators.
            </P>
            <P>
              You are granted a limited, non-exclusive, non-transferable licence to use the
              platform for your own personal trading. You may not copy, reproduce, redistribute,
              sell, or create derivative works from any part of FreedomBot.ai without our express
              written permission.
            </P>
          </Section>

          {/* 11. Service availability */}
          <Section title="11. Service availability" icon={<Settings className="h-5 w-5" />}>
            <P>
              We aim to keep FreedomBot.ai operational 24/7. However, we do not guarantee
              uninterrupted availability. The service may be temporarily unavailable due to:
            </P>
            <Bullet items={[
              "Scheduled maintenance or system upgrades",
              "Exchange API outages or rate limiting outside our control",
              "Network or infrastructure issues",
              "Force majeure events (market halts, extreme volatility, regulatory action)",
            ]} />
            <P>
              FreedomBot.ai is not liable for losses arising from periods of service
              unavailability, delayed trade execution, or exchange-side failures.
            </P>
          </Section>

          {/* 12. Termination */}
          <Section title="12. Termination" icon={<Ban className="h-5 w-5" />}>
            <P>
              You may stop using FreedomBot.ai at any time by stopping your bot from the dashboard
              and revoking your API key from your exchange.
            </P>
            <P>
              FreedomBot.ai reserves the right to suspend or terminate your account immediately,
              with or without notice, if:
            </P>
            <Bullet items={[
              "Fees owed under the PostPay plan remain unpaid beyond the agreed payment period",
              "We detect suspicious behaviour, including but not limited to repeated API key changes designed to evade identification, multiple account registrations, or attempts to manipulate fee calculations",
              "You provide false or fraudulent credentials",
              "You violate any provision of these Terms",
              "We are required to do so by law or regulatory authority",
            ]} />
            <P>
              Upon termination, your encrypted credentials are deleted from our systems. Any
              open trades at the time of termination will not be automatically closed — you remain
              responsible for managing open positions in your exchange account.
            </P>
          </Section>

          {/* 13. Limitation of liability */}
          <Section title="13. Limitation of liability" icon={<Scale className="h-5 w-5" />}>
            <P>
              To the maximum extent permitted by applicable law, FreedomBot.ai and its operators
              shall not be liable for:
            </P>
            <Bullet items={[
              "Any trading losses, whether direct or indirect, arising from bot operation",
              "Loss of profits, loss of capital, or loss of opportunity",
              "Losses arising from exchange outages, API failures, or slippage",
              "Losses arising from market events including flash crashes, liquidity gaps, or extreme volatility",
              "Unauthorised access to your exchange account through channels outside FreedomBot's systems",
              "Any indirect, incidental, consequential, or punitive damages of any kind",
            ]} />
            <P>
              Our total aggregate liability to you for any claim arising from your use of
              FreedomBot.ai shall not exceed the total fees you have paid to us in the 3 months
              preceding the claim. For users on the free plan, our aggregate liability is zero.
            </P>
          </Section>

          {/* 14. Governing law */}
          <Section title="14. Governing law and disputes" icon={<Scale className="h-5 w-5" />}>
            <P>
              These Terms are governed by and construed in accordance with the{" "}
              <Highlight>laws of India</Highlight>. Any dispute arising out of or in connection
              with these Terms shall first be attempted to be resolved through good-faith
              negotiation between the parties.
            </P>
            <P>
              If negotiation fails, disputes shall be subject to the exclusive jurisdiction of the
              courts of <Highlight>Lucknow, Uttar Pradesh, India</Highlight>.
            </P>
          </Section>

          {/* 15. Changes */}
          <Section title="15. Changes to these terms" icon={<RefreshCw className="h-5 w-5" />}>
            <P>
              We may update these Terms from time to time. When we do, we will update the
              &quot;Last updated&quot; date at the top of this page. For material changes, we will
              notify active users by email where possible.
            </P>
            <P>
              Continued use of FreedomBot.ai after changes are posted constitutes your acceptance
              of the revised Terms. If you do not agree with any changes, you should stop using
              the platform and revoke your API key from your exchange.
            </P>
          </Section>

          {/* 16. Contact */}
          <Section title="16. Contact" icon={<Mail className="h-5 w-5" />}>
            <P>For questions about these Terms, please use our contact form:</P>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 font-semibold transition-colors hover:text-blue-300"
              style={{ color: "#60a5fa" }}
            >
              <Mail className="h-4 w-4" /> Contact Us →
            </Link>
            <P>We aim to respond within 5 business days.</P>
          </Section>

        </div>

        <p className="text-center mt-12 text-xs" style={{ color: "#334155" }}>
          FreedomBot.ai · Trading involves risk. Past performance does not guarantee future results.
        </p>
      </div>

      {/* Footer */}
      <footer className="py-10" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: "#334155" }}>© 2026 FreedomBot.ai</p>
          <div className="flex gap-6">
            <Link href="/about" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>About</Link>
            <Link href="/privacy" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
