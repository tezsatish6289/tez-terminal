"use client";

const CTA_RING_CSS = `
@keyframes levels-cta-border-spin {
  to { transform: rotate(360deg); }
}
.levels-slideshow-cta-ring {
  position: relative;
  display: inline-flex;
  border-radius: 0.375rem;
  padding: 1px;
  overflow: hidden;
  flex-shrink: 0;
}
.levels-slideshow-cta-ring::before {
  content: "";
  position: absolute;
  inset: -120%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 235deg,
    rgba(96, 165, 250, 0.25) 265deg,
    rgba(191, 219, 254, 1) 295deg,
    rgba(59, 130, 246, 1) 315deg,
    rgba(147, 197, 253, 0.95) 335deg,
    rgba(96, 165, 250, 0.35) 350deg,
    transparent 360deg
  );
  animation: levels-cta-border-spin 2.4s linear infinite;
}
`;

/** Same row height as zone legend chips (`h-7`). */
export const LEVELS_TOOLBAR_CHIP_HEIGHT = "h-7";

export function LevelsSlideshowCta({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CTA_RING_CSS }} />
      <span className="levels-slideshow-cta-ring">
        <button
          type="button"
          onClick={onClick}
          title={title}
          className={`inline-flex items-center gap-1.5 px-2.5 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-[5px] transition-all hover:brightness-110 active:scale-[0.98]`}
          style={{
            background:
              "linear-gradient(135deg, rgba(29,78,216,0.85) 0%, rgba(37,99,235,0.65) 50%, rgba(30,64,175,0.9) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 20px rgba(37,99,235,0.45)",
          }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
            style={{ color: "#f8fafc", lineHeight: 1.2 }}
          >
            {label}
          </span>
          <span
            className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap hidden sm:inline"
            style={{ color: "#93c5fd", lineHeight: 1.2 }}
          >
            · S
          </span>
        </button>
      </span>
    </>
  );
}
