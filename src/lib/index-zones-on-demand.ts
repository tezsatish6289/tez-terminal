import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import {
  INDEX_KEYS,
  INDEX_SPECS,
  type IndexKey,
} from "@/lib/index-options-zones";
import { refreshSingleIndexZone } from "@/lib/index-zones-store";

export function normalizeIndexKey(symbol: string): IndexKey | null {
  const key = symbol.trim().toUpperCase();
  return (INDEX_KEYS as readonly string[]).includes(key) ? (key as IndexKey) : null;
}

export async function computeIndexZonesOnDemand(key: IndexKey): Promise<{ ok: boolean }> {
  const db = getAdminFirestore();
  const result = await refreshSingleIndexZone(db, key);
  return { ok: result === "ok" };
}

export function indexLevelsLabel(key: IndexKey): string {
  return INDEX_SPECS[key].label;
}
