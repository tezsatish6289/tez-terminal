import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/seo/constants";

export const metadata: Metadata = {
  title: "Dashboard — FreedomBot.ai",
  robots: NOINDEX_ROBOTS,
};

export default function FreedomBotDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
