import { FnoNinjaSrReplaysShowcase } from "@/components/fnoninja/FnoNinjaSrReplaysShowcase";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { listSrReplaysWithStories, type SrReplayWithStory } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

export async function FnoNinjaSrReplaysSection() {
  let replays: SrReplayWithStory[] = [];
  try {
    replays = await listSrReplaysWithStories({ sort: "best", limit: 12 });
  } catch (e) {
    // A replay/data-store hiccup must not take down the whole landing page.
    console.error("[FnoNinjaSrReplaysSection] failed to load replays:", e);
  }

  // No replays (empty or fetch failed) → hide the section entirely.
  if (replays.length === 0) return null;

  return (
    <section
      id="real-examples"
      className="border-b"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className={`${FNO_LANDING_SHELL} py-14 sm:py-20 lg:py-24`}>
        <div className="mb-10 sm:mb-12 max-w-3xl">
          <h2 className="text-2xl sm:text-3xl lg:text-[2.35rem] font-black text-white tracking-tight leading-[1.12]">
            Put/Call Clusters often act as Support &amp; Resistance zones
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: FNO_MUTED }}>
            These are not predictions. Price tends to react around them. See some real profitable moves below.
          </p>
        </div>

        <FnoNinjaSrReplaysShowcase initialReplays={replays} initialSort="best" />
      </div>
    </section>
  );
}
