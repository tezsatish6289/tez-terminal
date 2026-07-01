import { FnoNinjaSrReplaysShowcase } from "@/components/fnoninja/FnoNinjaSrReplaysShowcase";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { listSrReplaySummaries } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export async function FnoNinjaSrReplaysSection() {
  const replays = await listSrReplaySummaries({ sort: "best", limit: 12 });

  return (
    <section
      id="real-examples"
      className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          These levels are not predictions.
        </h2>
        <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
          But price often reacts around them. See real examples below.
        </p>
      </div>

      <FnoNinjaSrReplaysShowcase initialReplays={replays} initialSort="best" />
    </section>
  );
}
