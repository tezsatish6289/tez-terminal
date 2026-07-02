"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { FnoNinjaWebinarCard } from "@/components/fnoninja/FnoNinjaWebinarSection";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_LANDING_FOLD_CLASS } from "@/lib/fnoninja/responsive";
import { FNO_GRADIENT_TEXT, FNO_MUTED } from "@/lib/fnoninja/theme";

const ATLAS_AGENT_SRC = "/fnoninja/atlas-agent.webp";

function AtlasAgentImage() {
  return (
    <Image
      src={ATLAS_AGENT_SRC}
      alt="Atlas AI trading assistant"
      width={687}
      height={1024}
      className="h-auto w-auto max-h-[140px] sm:max-h-[160px] lg:max-h-[180px] max-w-[120px] sm:max-w-[140px] lg:max-w-[160px] object-contain object-left"
      sizes="(max-width: 1024px) 100vw, 50vw"
    />
  );
}

export function FnoNinjaAtlasPromoSection() {
  const [registrationCount, setRegistrationCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fnoninja/webinar/stats", { cache: "no-store" });
        const json = (await res.json()) as { total?: number };
        if (!cancelled && res.ok && typeof json.total === "number") {
          setRegistrationCount(json.total);
        }
      } catch {
        // Omit count on failure — card still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      id="atlas-ai"
      className={`${FNO_LANDING_SHELL} ${FNO_LANDING_FOLD_CLASS} flex flex-col py-10 sm:py-12 lg:py-14`}
      style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-8 xl:gap-10">
          <div className="flex flex-col justify-center">
            <h2 className="text-3xl font-black leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              <span className="block">New to F&amp;O Trading?</span>
              <span className="mt-3 block">Don&apos;t worry — we got you covered,</span>
            </h2>
            <p className="mt-5 text-xl font-semibold leading-snug sm:text-2xl lg:text-3xl" style={{ color: FNO_MUTED }}>
              Let our{" "}
              <span
                className="font-bold"
                style={{
                  background: FNO_GRADIENT_TEXT,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                ATLAS AI
              </span>{" "}
              assist you in becoming a top trader.
            </p>
            <div className="mt-6 sm:mt-8">
              <AtlasAgentImage />
            </div>
          </div>

          <FnoNinjaWebinarCard compact registrationCount={registrationCount} />
        </div>
        <p
          className="mt-6 text-center text-[11px] leading-relaxed max-w-lg mx-auto shrink-0"
          style={{ color: "#475569" }}
        >
          Educational session · not investment advice.
        </p>
      </div>
    </section>
  );
}
