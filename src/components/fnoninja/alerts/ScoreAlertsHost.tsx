"use client";

import { ScoreAlertsDrawer } from "@/components/fnoninja/alerts/ScoreAlertsDrawer";
import { useUser } from "@/firebase";

/** Drawer host — only meaningful when signed in (provider still mounts). */
export function ScoreAlertsHost() {
  const { user, isUserLoading } = useUser();
  if (isUserLoading || !user) return null;
  return <ScoreAlertsDrawer />;
}
