"use client";

import { useEffect, useState } from "react";
import type { CryptoBotId } from "@/lib/crypto-bots";
import type { PublicBotFlags } from "@/lib/public-bot-flags";
import { defaultPublicBotFlags } from "@/lib/public-bot-flags";

export interface PublicBotApiRow {
  id: CryptoBotId;
  label: string;
  shortLabel: string;
  deployKey: string;
  botSource: string;
  icon: string;
  logo: string | null;
  publicLive: boolean;
}

interface PublicBotsResponse {
  bots: PublicBotApiRow[];
  defaultBotId: CryptoBotId;
}

export function usePublicBots() {
  const [bots, setBots] = useState<PublicBotApiRow[]>([]);
  const [flags, setFlags] = useState<PublicBotFlags>(defaultPublicBotFlags);
  const [defaultBotId, setDefaultBotId] = useState<CryptoBotId>("crypto");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/freedombot/public-bots")
      .then((r) => r.json())
      .then((data: PublicBotsResponse) => {
        if (data.bots?.length) {
          setBots(data.bots);
          setDefaultBotId(data.defaultBotId ?? "crypto");
          const next = defaultPublicBotFlags();
          for (const b of data.bots) next[b.id] = b.publicLive;
          setFlags(next);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { bots, flags, defaultBotId, loading };
}
