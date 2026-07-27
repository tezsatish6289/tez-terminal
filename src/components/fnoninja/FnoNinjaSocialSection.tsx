"use client";

import { Facebook, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/fnoninja/landing-motion";
import { FNONINJA_SOCIAL_LINKS, type FnoNinjaSocialPlatform } from "@/lib/fnoninja/social-links";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

function SocialIcon({ platform }: { platform: FnoNinjaSocialPlatform }) {
  switch (platform) {
    case "x":
      return <Twitter className="h-4 w-4" strokeWidth={1.8} />;
    case "instagram":
      return <Instagram className="h-4 w-4" strokeWidth={1.8} />;
    case "youtube":
      return <Youtube className="h-4 w-4" strokeWidth={1.8} />;
    case "linkedin":
      return <Linkedin className="h-4 w-4" strokeWidth={1.8} />;
    case "facebook":
      return <Facebook className="h-4 w-4" strokeWidth={1.8} />;
  }
}

export function FnoNinjaSocialSection() {
  return (
    <section id="social" className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <Reveal className="max-w-3xl">
        <SectionEyebrow>Follow us</SectionEyebrow>
        <h2 className="mt-4 text-2xl sm:text-3xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Stay connected with <GradientText>FNO NINJA</GradientText>
        </h2>
        <p className="mt-4 max-w-2xl text-sm sm:text-base leading-relaxed text-slate-400">
          Market structure updates, product news, and educational content — informational only, not
          investment advice.
        </p>
      </Reveal>

      <Stagger className="mt-10 flex flex-wrap gap-3">
        {FNONINJA_SOCIAL_LINKS.map((link) => (
          <StaggerItem key={link.platform}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              onClick={() =>
                trackCtaClick("social_click", {
                  platform: link.platform,
                  label: link.label,
                  href: link.href,
                })
              }
              className="inline-flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-[#3b82f6]/40 hover:bg-white/[0.03] hover:text-white"
              style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "rgba(255,255,255,0.02)" }}
            >
              <SocialIcon platform={link.platform} />
              {link.platform === "x" ? "X" : link.platform.charAt(0).toUpperCase() + link.platform.slice(1)}
            </a>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
