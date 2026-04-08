import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FreedomBot.ai — Fastracking Financial Freedom",
  description:
    "FreedomBot trades financial markets 24/7 to fastrack your financial freedom. Deploy AI-powered crypto trading bots with one click.",
  openGraph: {
    title: "FreedomBot.ai — Fastracking Financial Freedom",
    description:
      "FreedomBot trades financial markets 24/7 to fastrack your financial freedom.",
    siteName: "FreedomBot.ai",
  },
};

export default function FreedomBotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
