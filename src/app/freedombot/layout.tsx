import type { Metadata } from "next";
import { FreedomBotNav } from "./components/FreedomBotNav";

export const metadata: Metadata = {
  title: "FreedomBot.ai — Trade with full transparency and control",
  description:
    "FreedomBot is an algorithmic trading system where every trade is recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
  icons: {
    icon: "/freedombot/icon.png",
    apple: "/freedombot/icon.png",
  },
  openGraph: {
    title: "FreedomBot.ai — Trade with full transparency and control",
    description:
      "Every trade recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
    siteName: "FreedomBot.ai",
  },
};

export default function FreedomBotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FreedomBotNav />
      {children}
    </>
  );
}
