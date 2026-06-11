import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  Shield,
  Ban,
  Scale,
  Settings,
  Mail,
} from "lucide-react";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";
import {
  FnoNinjaLegalBackLink,
  FnoNinjaLegalBadge,
  FnoNinjaLegalFooter,
  FnoNinjaLegalIntro,
  FnoNinjaLegalMeta,
  FnoNinjaLegalPage,
  FnoNinjaLegalSection,
  FnoNinjaLegalSections,
  FnoNinjaLegalTitle,
  LegalBullet,
  LegalHighlight,
  LegalP,
  LegalProhibited,
} from "@/components/fnoninja/FnoNinjaLegalShell";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export const metadata = {
  title: "Terms of Use",
  description:
    "Terms of Use for FNONINJA — option-chain analytics and market data visualization for NSE F&O.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/terms` },
};

const LAST_UPDATED = "5 June 2026";

const DOES_NOT_PROVIDE = [
  "Investment advice or buy/sell recommendations",
  "Stock or derivatives calls",
  "Research analyst reports (as defined under SEBI regulations)",
  "Portfolio management or personalized financial guidance",
  "Trade execution, brokerage, or custody of funds",
];

export default function FnoNinjaTermsPage() {
  return (
    <FnoNinjaLegalPage>
      <FnoNinjaLegalBackLink />
      <FnoNinjaLegalBadge icon={<FileText className="h-3 w-3" />} label="Terms of Use" />
      <FnoNinjaLegalTitle>Terms of Use</FnoNinjaLegalTitle>
      <FnoNinjaLegalIntro>
        Please read these terms carefully before using fnoninja.com. By accessing or using the
        platform, you agree to be bound by them and our{" "}
        <Link href="/privacy" className="font-semibold hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
          Privacy Policy
        </Link>
        .
      </FnoNinjaLegalIntro>
      <FnoNinjaLegalMeta>Last updated: {LAST_UPDATED}</FnoNinjaLegalMeta>

      <FnoNinjaLegalSections>
        <FnoNinjaLegalSection title="1. Introduction" icon={<FileText className="h-5 w-5" />}>
          <LegalP>
            Welcome to <LegalHighlight>fnoninja.com</LegalHighlight> (&quot;FNONINJA&quot;,
            &quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;). These Terms of Use govern your
            access to and use of the website, market maps, symbol dashboards, charts, and related
            analytics features.
          </LegalP>
          <LegalP>
            We may update these Terms at any time. Your continued use of the Platform after changes
            are posted constitutes acceptance of the revised Terms.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="2. Definitions" icon={<FileText className="h-5 w-5" />}>
          <LegalBullet
            items={[
              '"Platform" — fnoninja.com and associated web applications, including /levels and symbol chart views',
              '"User" / "You" — any person who accesses or uses the Platform',
              '"Services" — market data visualization, option-chain derived observations, maps, filters, and related informational tools',
              '"Derived observations" — support/resistance bands, open-interest context, max pain levels, and similar metrics computed from public option-chain data',
            ]}
          />
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="3. Use and access to the Platform" icon={<Shield className="h-5 w-5" />}>
          <LegalP>
            Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to
            access and use the Platform for <LegalHighlight>personal research and educational purposes</LegalHighlight>.
          </LegalP>
          <LegalP>You agree not to:</LegalP>
          <LegalProhibited
            items={[
              "Use the Platform for commercial redistribution of our data, charts, or derived observations without written permission",
              "Scrape, crawl, or automate bulk extraction of Platform content except as explicitly permitted",
              "Misrepresent derived observations as official exchange data, guaranteed forecasts, or trading signals",
              "Frame, mirror, or deep-link into gated areas without authorization",
              "Interfere with Platform security, availability, or other users' access",
              "Use the Platform in any manner that violates applicable law",
            ]}
          />
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="4. Your account" icon={<Settings className="h-5 w-5" />}>
          <LegalP>
            Certain features (such as symbol chart deep-dives) may require sign-in via Google. You are
            responsible for maintaining the confidentiality of your account and for all activity under
            it. Provide accurate information and notify us promptly of unauthorized use via our{" "}
            <Link href="/contact" className="font-semibold hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
              contact form
            </Link>
            .
          </LegalP>
          <LegalP>
            We may suspend or terminate access if we reasonably believe you have violated these Terms
            or misused the Platform.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="5. Service description" icon={<Settings className="h-5 w-5" />}>
          <LegalP>
            FNONINJA processes publicly available NSE F&amp;O option-chain data to produce{" "}
            <LegalHighlight>informational visualizations and derived observations</LegalHighlight> —
            including open-interest concentrations, option-derived zone bands, and related market
            structure metrics.
          </LegalP>
          <LegalP>FNONINJA does not provide:</LegalP>
          <LegalProhibited items={DOES_NOT_PROVIDE} />
          <LegalP>
            Services are provided on an &quot;as is&quot; and &quot;as available&quot; basis. Market
            data may be delayed, incomplete, or inaccurate. We do not warrant uninterrupted or
            error-free operation.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection
          title="6. No investment advice — regulatory status"
          icon={<Ban className="h-5 w-5" />}
          highlight
        >
          <LegalP>
            Nothing on FNONINJA constitutes financial, investment, legal, or tax advice. All content is
            for <LegalHighlight>informational and educational purposes only</LegalHighlight>. You are
            solely responsible for your own trading and investment decisions.
          </LegalP>
          <LegalP>
            FNONINJA is <LegalHighlight>not registered</LegalHighlight> with the Securities and Exchange
            Board of India (SEBI) as a Research Analyst or Investment Adviser under applicable
            regulations.
          </LegalP>
          <LegalP>
            FNONINJA is not affiliated with, endorsed by, or sponsored by the National Stock Exchange
            (NSE), Bombay Stock Exchange (BSE), or any broker or exchange.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="7. Financial risk disclaimer" icon={<AlertTriangle className="h-5 w-5" />} highlight>
          <LegalP>
            Derivatives and securities trading involve substantial risk of loss and are not suitable for
            all investors. Past patterns and derived observations do{" "}
            <LegalHighlight>not</LegalHighlight> guarantee future results.
          </LegalP>
          <LegalP>
            You should conduct independent research and consult a qualified financial adviser before
            making any investment or trading decision.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="8. Intellectual property" icon={<FileText className="h-5 w-5" />}>
          <LegalP>
            The Platform, its design, software, algorithms, and branding are owned by us or our
            licensors and protected by applicable intellectual property laws. You may not copy,
            modify, distribute, or create derivative works except as expressly permitted.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="9. Limitation of liability" icon={<Scale className="h-5 w-5" />}>
          <LegalP>
            To the fullest extent permitted by law, FNONINJA and its operators shall not be liable for
            any direct, indirect, incidental, consequential, or punitive damages arising from your use
            of the Platform or reliance on any derived observation, including trading losses.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="10. Indemnity" icon={<Shield className="h-5 w-5" />}>
          <LegalP>
            You agree to indemnify and hold harmless FNONINJA and its operators from claims, damages,
            and expenses arising from your misuse of the Platform or violation of these Terms.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="11. Governing law" icon={<Scale className="h-5 w-5" />}>
          <LegalP>
            These Terms are governed by the laws of India. Courts in India shall have exclusive
            jurisdiction over disputes arising from these Terms, subject to applicable law.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="12. Contact" icon={<Mail className="h-5 w-5" />}>
          <LegalP>
            Questions about these Terms? Reach us via the{" "}
            <Link href="/contact" className="font-semibold hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
              contact form
            </Link>
            .
          </LegalP>
        </FnoNinjaLegalSection>
      </FnoNinjaLegalSections>

      <FnoNinjaLegalFooter />
    </FnoNinjaLegalPage>
  );
}
