import { FnoNinjaHeroCard } from "@/components/fnoninja/FnoNinjaHeroCard";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_HERO_TEXTURE, FNO_HERO_TEXTURE_SIZE } from "@/lib/fnoninja/theme";

export function FnoNinjaHero() {
  return (
    <section
      className="relative border-b flex flex-col h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] min-h-0 overflow-hidden"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: FNO_HERO_TEXTURE,
            backgroundSize: FNO_HERO_TEXTURE_SIZE,
          }}
        />
        <div
          className="absolute -top-[30%] -left-[20%] w-[70%] h-[80%] rounded-full blur-[140px]"
          style={{ backgroundColor: "rgba(37,99,235,0.07)" }}
        />
        <div
          className="absolute top-[5%] right-[-10%] w-[50%] h-[60%] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(96,165,250,0.05)" }}
        />
      </div>

      <div className={`relative ${FNO_LANDING_SHELL} flex-1 flex flex-col min-h-0 py-3 sm:py-4 lg:py-5`}>
        <FnoNinjaHeroCard />
      </div>
    </section>
  );
}
