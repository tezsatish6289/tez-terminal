import { FnoNinjaSrReplayCarousel } from "@/components/fnoninja/FnoNinjaSrReplayCarousel";
import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { listSrReplayShorts } from "@/lib/fnoninja/sr-replays";
import { FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export async function FnoNinjaSrReplaysSection() {
  const replays = await listSrReplayShorts(12);

  return (
    <section
      id="real-examples"
      className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div className="max-w-3xl mb-8 sm:mb-10 lg:mb-12">
        <p className="text-sm sm:text-base font-semibold text-white/90">
          These levels are not predictions.
        </p>
        <p className="mt-2 text-sm sm:text-base lg:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
          But price often reacts around them. See real examples below.
        </p>
      </div>

      <FnoNinjaSrReplayCarousel replays={replays} />
    </section>
  );
}
