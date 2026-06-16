"use client";

/** Subtle one-line reminder above the composer — chat is opinions, not advice. */
export function ChatDisclaimer() {
  return (
    <p
      className="px-4 pt-2 text-center text-[10px] leading-snug"
      style={{ color: "#5b6678" }}
    >
      Opinions only — <span style={{ color: "#7c8aa0" }}>not investment advice</span>. No buy/sell tips.
    </p>
  );
}
