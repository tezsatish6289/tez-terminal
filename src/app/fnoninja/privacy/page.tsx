import Link from "next/link";
import { Shield, Lock, Eye, Server, Trash2, Mail } from "lucide-react";
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
} from "@/components/fnoninja/FnoNinjaLegalShell";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How FNONINJA collects, uses, and protects your data when you use our NSE F&O market analytics platform.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/privacy` },
};

const LAST_UPDATED = "5 June 2026";

export default function FnoNinjaPrivacyPage() {
  return (
    <FnoNinjaLegalPage>
      <FnoNinjaLegalBackLink />
      <FnoNinjaLegalBadge icon={<Shield className="h-3 w-3" />} label="Privacy Policy" />
      <FnoNinjaLegalTitle>Privacy Policy</FnoNinjaLegalTitle>
      <FnoNinjaLegalIntro>
        This policy explains what information we collect when you use FNONINJA, how we use it, and
        the choices you have. FNONINJA is a market analytics and data visualization platform — not a
        broker, adviser, or trading service.
      </FnoNinjaLegalIntro>
      <FnoNinjaLegalMeta>
        Last updated: {LAST_UPDATED} · Operated via FreedomBot.ai infrastructure
      </FnoNinjaLegalMeta>

      <FnoNinjaLegalSections>
        <FnoNinjaLegalSection title="1. Who we are" icon={<Shield className="h-5 w-5" />}>
          <LegalP>
            <LegalHighlight>fnoninja.com</LegalHighlight> (&quot;FNONINJA&quot;, &quot;we&quot;,
            &quot;us&quot;) provides option-chain derived market maps, symbol analytics, and
            educational visualizations for NSE F&amp;O. The platform is powered by FreedomBot.ai
            technology infrastructure.
          </LegalP>
          <LegalP>
            For privacy-related questions, contact us at{" "}
            <Link href="/contact" className="font-semibold hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
              our contact form
            </Link>
            .
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="2. Information we collect" icon={<Eye className="h-5 w-5" />}>
          <LegalP>Depending on how you use the platform, we may collect:</LegalP>
          <LegalBullet
            items={[
              "Account information — when you sign in with Google (name, email address, profile identifier)",
              "Usage data — pages viewed, symbols explored, session timestamps, and basic device/browser metadata",
              "Contact form submissions — name, email, mobile (optional), country, and message content",
              "Technical logs — IP address, request timestamps, and error diagnostics for security and reliability",
            ]}
          />
          <LegalP>
            We do <LegalHighlight>not</LegalHighlight> collect brokerage credentials, trading passwords,
            PAN, Aadhaar, or payment card details through FNONINJA. We do not execute trades on your
            behalf.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="3. How we use your information" icon={<Server className="h-5 w-5" />}>
          <LegalBullet
            items={[
              "Authenticate you and provide access to gated features (e.g. symbol chart deep-dives)",
              "Operate, maintain, and improve maps, charts, and analytics views",
              "Respond to support and contact requests",
              "Monitor abuse, protect the platform, and comply with applicable law",
              "Understand aggregate usage patterns to improve the product",
            ]}
          />
          <LegalP>
            We do not use your data to provide investment advice, stock recommendations, or
            personalized trading guidance.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="4. Encryption and storage" icon={<Lock className="h-5 w-5" />}>
          <LegalP>
            Contact form fields containing personal identifiers (name, email, mobile) are{" "}
            <LegalHighlight>encrypted before storage</LegalHighlight>. Messages are stored so our team
            can respond to your enquiry. Account and usage data are stored in secure cloud
            infrastructure (Firebase / Google Cloud).
          </LegalP>
          <LegalP>
            We apply industry-standard transport security (HTTPS/TLS) for data in transit.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="5. Sharing with third parties" icon={<Server className="h-5 w-5" />}>
          <LegalP>We may share limited data with service providers who help us run the platform, such as:</LegalP>
          <LegalBullet
            items={[
              "Google — authentication (Sign in with Google) and cloud hosting",
              "Infrastructure providers — hosting, logging, and security services",
            ]}
          />
          <LegalP>
            We do not sell your personal information. We may disclose information if required by law,
            court order, or to protect the rights and safety of users and the platform.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="6. Cookies and local storage" icon={<Eye className="h-5 w-5" />}>
          <LegalP>
            We use cookies and browser local storage for authentication sessions, preferences, and
            basic analytics. You can control cookies through your browser settings; disabling them may
            limit sign-in and certain features.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="7. Data retention" icon={<Trash2 className="h-5 w-5" />}>
          <LegalP>
            We retain account and usage data for as long as your account is active or as needed to
            operate the service. Contact submissions are retained for support and audit purposes.
            You may request deletion of your account-related data by contacting us.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="8. Your rights" icon={<Shield className="h-5 w-5" />}>
          <LegalP>
            Subject to applicable law, you may request access to, correction of, or deletion of your
            personal data. To exercise these rights, use our{" "}
            <Link href="/contact" className="font-semibold hover:text-white transition-colors" style={{ color: FNO_ACCENT }}>
              contact form
            </Link>
            .
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="9. Children" icon={<Shield className="h-5 w-5" />}>
          <LegalP>
            FNONINJA is not directed at children under 18. We do not knowingly collect personal
            information from minors.
          </LegalP>
        </FnoNinjaLegalSection>

        <FnoNinjaLegalSection title="10. Changes to this policy" icon={<Mail className="h-5 w-5" />}>
          <LegalP>
            We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at
            the top will reflect the latest revision. Continued use of the platform after changes
            constitutes acceptance of the updated policy.
          </LegalP>
        </FnoNinjaLegalSection>
      </FnoNinjaLegalSections>

      <FnoNinjaLegalFooter />
    </FnoNinjaLegalPage>
  );
}
