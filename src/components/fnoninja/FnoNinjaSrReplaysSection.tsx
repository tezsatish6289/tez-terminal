import { FnoNinjaSrReplaysShowcase } from "@/components/fnoninja/FnoNinjaSrReplaysShowcase";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { listSrReplaysWithStories } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export async function FnoNinjaSrReplaysSection() {
  const replays = await listSrReplaysWithStories({ sort: "best", limit: 12 });

  return (
    <section
      id="real-examples"
      className={`${FB_CONTENT_SHELL} py-10 sm:py-12 lg:py-14`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div className="mb-6 sm:mb-7 max-w-3xl">
        <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
          Put/Call Clusters often act as Support &amp; Resistance zones
        </h2>
        <p className="mt-3 sm:mt-3.5 text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: FNO_MUTED }}>
          These are not predictions. Price tends to react around them. See some real profitable moves below.
        </p>
      </div>

      <FnoNinjaSrReplaysShowcase initialReplays={replays} initialSort="best" />
    </section>
  );
}
