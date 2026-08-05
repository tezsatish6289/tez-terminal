"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { CommunityChatPreview } from "@/components/fnoninja/chat/CommunityChatPreview";
import {
  FNO_COMMUNITY_PAGE_BENEFITS,
  FNO_COMMUNITY_PAGE_SUBTITLE,
  FNO_LOGIN_DISCLAIMER,
  FNO_LOGIN_TRIAL_NOTE,
} from "@/lib/fnoninja/login-copy";
import { fnoCommunityChatHref } from "@/lib/fnoninja/paths";
import { FNO_CONTENT_SHELL } from "@/lib/fnoninja/responsive";
import { FNO_MUTED } from "@/lib/fnoninja/theme";
import { GradientText, SectionEyebrow } from "@/lib/fnoninja/landing-ui";

function FnoNinjaCommunityPageInner() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const postSignInHref = fnoCommunityChatHref(pathname);

  useEffect(() => {
    if (isUserLoading || !user) return;
    router.replace(postSignInHref);
  }, [user, isUserLoading, postSignInHref, router]);

  if (isUserLoading || user) {
    return (
      <main className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
      </main>
    );
  }

  return (
    <main className={`${FNO_CONTENT_SHELL} flex-1 py-10 sm:py-14 lg:py-16`}>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-12 xl:gap-16">
        <div className="max-w-xl">
          <SectionEyebrow>Community</SectionEyebrow>
          <h1 className="mt-4 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-4xl">
            Discuss structure{" "}
            <GradientText>with serious traders.</GradientText>
          </h1>
          <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: FNO_MUTED }}>
            {FNO_COMMUNITY_PAGE_SUBTITLE}
          </p>

          <ul className="mt-8 space-y-3.5">
            {FNO_COMMUNITY_PAGE_BENEFITS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold"
                  style={{
                    borderColor: "rgba(96,165,250,0.35)",
                    backgroundColor: "rgba(37,99,235,0.12)",
                    color: "#60a5fa",
                  }}
                >
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <Suspense
              fallback={<Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_MUTED }} />}
            >
              <FnoNinjaGoogleSignInButton
                size="hero"
                className="w-full sm:w-auto"
                ctaId="community_page_sign_in"
                signUpSource="community_page"
                signUpSourceCta="join_community"
                postSignInHref={postSignInHref}
              />
            </Suspense>
            <p className="mt-3 text-[12px] font-medium" style={{ color: "#93c5fd" }}>
              {FNO_LOGIN_TRIAL_NOTE}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#64748b" }}>
              {FNO_LOGIN_DISCLAIMER}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#64748b" }}>
              User opinions only — not investment advice.
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:pl-2">
          <CommunityChatPreview blurred />
        </div>
      </div>
    </main>
  );
}

export function FnoNinjaCommunityPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
        </main>
      }
    >
      <FnoNinjaCommunityPageInner />
    </Suspense>
  );
}
