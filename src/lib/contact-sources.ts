/** Short labels stored on contact_submissions.source (admin inbox). */
export const CONTACT_SOURCE_FNONINJA = "fnoninja";
export const CONTACT_SOURCE_FREEDOMBOT = "freedombot";
export const CONTACT_SOURCE_TEZTERMINAL = "tezterminal";

export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  [CONTACT_SOURCE_FNONINJA]: "FNONINJA",
  [CONTACT_SOURCE_FREEDOMBOT]: "FreedomBot",
  [CONTACT_SOURCE_TEZTERMINAL]: "TezTerminal",
  "freedombot.ai": "FreedomBot",
  "fnoninja.com": "FNONINJA",
};

export function contactSourceLabel(source: string): string {
  return CONTACT_SOURCE_LABELS[source] ?? source;
}
