import { noindexMetadata } from "@/lib/seo/noindex-metadata";

export const metadata = noindexMetadata("Simulation — TezTerminal");

export default function SimulationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
