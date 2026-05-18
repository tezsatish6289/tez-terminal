/**
 * Pure mirroring status helpers (safe for client and server).
 */

export type MirroringDisplayStatus = "on" | "off" | "paused_today" | "stopped" | "unknown";

export interface MirroringFields {
  autoTradeEnabled: boolean | null;
  dailyLossHaltedToday: boolean;
}

export interface MirroringStatusView extends MirroringFields {
  status: MirroringDisplayStatus;
  label: string;
  liveMirroringActive: boolean;
}

export function computeMirroringStatus(
  deploymentActive: boolean,
  fields: MirroringFields,
): MirroringStatusView {
  if (!deploymentActive) {
    return {
      ...fields,
      status: "stopped",
      label: "Stopped",
      liveMirroringActive: false,
    };
  }

  const { autoTradeEnabled, dailyLossHaltedToday } = fields;

  if (autoTradeEnabled === null) {
    return {
      autoTradeEnabled,
      dailyLossHaltedToday,
      status: "unknown",
      label: "—",
      liveMirroringActive: false,
    };
  }

  const liveMirroringActive = autoTradeEnabled === true && !dailyLossHaltedToday;

  if (liveMirroringActive) {
    return {
      autoTradeEnabled,
      dailyLossHaltedToday,
      status: "on",
      label: "On",
      liveMirroringActive: true,
    };
  }

  if (dailyLossHaltedToday) {
    return {
      autoTradeEnabled,
      dailyLossHaltedToday,
      status: "paused_today",
      label: "Paused today",
      liveMirroringActive: false,
    };
  }

  if (autoTradeEnabled === false) {
    return {
      autoTradeEnabled,
      dailyLossHaltedToday,
      status: "off",
      label: "Off",
      liveMirroringActive: false,
    };
  }

  return {
    autoTradeEnabled,
    dailyLossHaltedToday,
    status: "unknown",
    label: "—",
    liveMirroringActive: false,
  };
}

export function mirroringStatusTooltip(view: Pick<MirroringStatusView, "status" | "label">): string {
  switch (view.status) {
    case "on":
      return "New platform signals are copied to this exchange (deployment active, auto-trade on, not paused for daily loss today).";
    case "off":
      return "Deployment is active but mirroring is off — auto-trade disabled (legacy kill switch or user turned it off in settings).";
    case "paused_today":
      return "Daily loss cap hit today (UTC). No new mirrored entries until tomorrow unless an admin force-resets mirroring.";
    case "stopped":
      return "Deployment is paused or stopped — no new mirrored trades regardless of auto-trade settings.";
    default:
      return "Could not read mirroring state from exchange credentials.";
  }
}

export function mirroringStatusColorClass(status: MirroringDisplayStatus): string {
  switch (status) {
    case "on":
      return "text-emerald-400";
    case "paused_today":
      return "text-amber-400";
    case "off":
      return "text-rose-400";
    case "stopped":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground/50";
  }
}
