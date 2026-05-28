import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — FreedomBot.ai",
  description:
    "Contact the FreedomBot team for support, partnerships, or questions about on-chain trading transparency and bot deployment.",
  alternates: { canonical: "https://freedombot.ai/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
