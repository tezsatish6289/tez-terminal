import { Star } from "lucide-react";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const REVIEWS = [
  {
    name: "Rohan M.",
    role: "Index option trader",
    quote:
      "The zone map helps me focus on the right strikes immediately. I still make my own decisions, but I spend a lot less time scanning chains.",
  },
  {
    name: "Anjali K.",
    role: "Swing trader",
    quote:
      "FNO Ninja's OI clusters line up well with support and resistance on the charts. It has become part of my pre-market routine.",
  },
  {
    name: "Siddharth P.",
    role: "Full-time F&O trader",
    quote:
      "The screener and filters are clean. No noise, just structure. Exactly what I was looking for in an F&O tool.",
  },
] as const;

export function FnoNinjaReviewsSection() {
  return (
    <section id="reviews" className={`${FNO_LANDING_SHELL} border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <SectionEyebrow>Reviews</SectionEyebrow>
        <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Trusted by traders who <GradientText>read the data.</GradientText>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed max-w-2xl text-slate-400">
          Real users. Real routines.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {REVIEWS.map((review) => (
          <article
            key={review.name}
            className="rounded-xl border p-6 transition hover:border-[#60a5fa]/30"
            style={{
              borderColor: FNO_LANDING_BORDER,
              backgroundColor: "#0d1830",
            }}
          >
            <div className="flex gap-1 text-amber-300">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" strokeWidth={1.5} />
              ))}
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
              &ldquo;{review.quote}&rdquo;
            </p>
            <div className="mt-5 flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold"
                style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
              >
                {review.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{review.name}</div>
                <div className="text-[12px] text-slate-500">
                  {review.role}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-8 text-xs leading-relaxed" style={{ color: "#475569" }}>
        Individual results vary. Reviews are shared by real users and are not guarantees of trading
        outcomes.
      </p>
    </section>
  );
}
