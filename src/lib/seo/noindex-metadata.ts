import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "./constants";

export function noindexMetadata(title?: string): Metadata {
  return {
    ...(title ? { title } : {}),
    robots: NOINDEX_ROBOTS,
  };
}
