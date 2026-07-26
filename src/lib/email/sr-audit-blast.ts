/**
 * After an SR-audit win story is scheduled to Buffer, sync the FNO Ninja
 * audience into the Resend segment and send a marketing Broadcast (link to
 * video — never attach the MP4).
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import { listFnoNinjaEmailAudience } from "@/lib/email/fnoninja-audience";
import {
  resendConfig,
  resendCreateAndSendBroadcast,
  resendCreateContact,
} from "@/lib/email/resend";
import type { SocialPlatformId } from "@/lib/social/platforms";

export const EMAIL_BLASTS_COLLECTION = "email_blasts";

const WEBSITE = "https://fnoninja.com";
/** PNG profile mark — Gmail/Outlook render this reliably (SVG often blocked). */
const LOGO_URL = `${WEBSITE}/fnoninja/social/twitter/profile-400x400.png`;
const BATCH = 25;
const BATCH_DELAY_MS = 200;

export interface SrAuditEmailBlastInput {
  contentId: string;
  contentLabel: string;
  videoUrl: string;
  captions: Partial<Record<SocialPlatformId, string>>;
  /** social_posts doc id when available */
  scheduleId?: string;
}

export interface SrAuditEmailBlastResult {
  skipped?: string;
  broadcastId?: string;
  contactsSynced?: number;
  contactErrors?: number;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prefer YouTube title block; fall back to Facebook first line / content label. */
export function buildSrAuditEmailSubject(
  captions: Partial<Record<SocialPlatformId, string>>,
  contentLabel: string,
): string {
  const yt = captions.youtube?.trim();
  if (yt) {
    const title = yt.split(/\n{2,}/)[0]?.trim().replace(/\s+/g, " ");
    if (title) return title.slice(0, 120);
  }
  const fb = captions.facebook?.trim();
  if (fb) {
    const line = fb.split("\n").find((l) => l.trim() && !l.includes("🎯"));
    if (line?.trim()) return line.trim().slice(0, 120);
  }
  return `${contentLabel} | FNO Ninja Win Recap`.slice(0, 120);
}

interface WinEmailMeta {
  label: string;
  movePct: string | null;
  summary: string;
  entrySpot: string | null;
  maxPain: string | null;
  timeline: string | null;
  preheader: string;
}

function storyLabel(contentLabel: string): string {
  return contentLabel.split("·")[0]?.trim() || contentLabel.trim() || "Win story";
}

function parseWinEmailMeta(
  captions: Partial<Record<SocialPlatformId, string>>,
  contentLabel: string,
): WinEmailMeta {
  const label = storyLabel(contentLabel);
  const yt = captions.youtube?.trim() ?? "";
  const ytTitle = yt.split(/\n{2,}/)[0]?.trim() ?? "";
  const ytBody = yt.split(/\n{2,}/).slice(1).join("\n");
  const fb = captions.facebook?.trim() ?? "";
  const blob = [ytTitle, ytBody, fb, captions.linkedin ?? ""].join("\n");

  const moveMatch = blob.match(/\+(\d+(?:\.\d+)?)%/);
  const movePct = moveMatch?.[1] ?? null;

  const entryMatch = blob.match(/(?:near|around|off)\s+(₹[\d,.]+)/i);
  const maxPainMatch = blob.match(/max[- ]pain[^₹\n]*?(₹[\d,.]+)/i);
  const timelineMatch = blob.match(/Entered\s+([^\n→]+)→\s*target hit\s+([^\n.]+)/i);

  const summaryLines = fb
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith("#") &&
        !l.startsWith("http") &&
        !/educational recap/i.test(l) &&
        !/see live wall/i.test(l) &&
        !/success story/i.test(l) &&
        !/^entered\s+/i.test(l) &&
        l !== "🎯",
    );
  const summary =
    summaryLines[0]?.replace(/\s+/g, " ").trim() ||
    ytBody.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ||
    `${label} ran${movePct ? ` +${movePct}%` : ""} to max pain — watch the win-story recap.`;

  const preheader = movePct
    ? `${label} ran +${movePct}% to max pain`
    : `${label} win-story recap from FNO Ninja`;

  return {
    label,
    movePct,
    summary,
    entrySpot: entryMatch?.[1] ?? null,
    maxPain: maxPainMatch?.[1] ?? null,
    timeline: timelineMatch
      ? `${timelineMatch[1].trim()} → ${timelineMatch[2].trim()}`
      : null,
    preheader,
  };
}

function factRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid rgba(90,140,220,0.12);">${escapeHtml(label)}</td>
    <td style="padding:8px 0;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;border-bottom:1px solid rgba(90,140,220,0.12);">${escapeHtml(value)}</td>
  </tr>`;
}

export function buildSrAuditEmailHtml(input: {
  contentLabel: string;
  videoUrl: string;
  captions: Partial<Record<SocialPlatformId, string>>;
}): string {
  const meta = parseWinEmailMeta(input.captions, input.contentLabel);
  const label = escapeHtml(meta.label);
  const summary = escapeHtml(meta.summary);
  const videoUrl = escapeHtml(input.videoUrl);
  const site = escapeHtml(WEBSITE);
  const logo = escapeHtml(LOGO_URL);
  const preheader = escapeHtml(meta.preheader);
  const moveLine = meta.movePct
    ? `<p style="margin:4px 0 0;font-size:28px;line-height:1.1;font-weight:800;color:#4ade80;letter-spacing:-0.02em;">+${escapeHtml(meta.movePct)}%</p>
       <p style="margin:4px 0 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#86efac;">to max pain</p>`
    : `<p style="margin:6px 0 0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#93c5fd;">Win story recap</p>`;

  const factRows = [
    meta.entrySpot ? factRow("Entry zone", meta.entrySpot) : "",
    meta.maxPain ? factRow("Max pain", meta.maxPain) : "",
    meta.timeline ? factRow("Timeline", meta.timeline) : "",
  ]
    .filter(Boolean)
    .join("");

  const factsBlock = factRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${factRows}</table>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#070d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d1a;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d1830;border:1px solid rgba(96,165,250,0.28);border-radius:18px;overflow:hidden;">
        <tr><td style="height:4px;background:linear-gradient(90deg,#2563eb,#60a5fa);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 28px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
            <tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <a href="${site}" style="text-decoration:none;">
                  <img src="${logo}" width="36" height="36" alt="FNO Ninja" style="display:block;border-radius:10px;border:0;" />
                </a>
              </td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;">FNO Ninja</p>
                <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Option-chain win recap</p>
              </td>
            </tr>
          </table>

          <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${label}</h1>
          ${moveLine}

          <p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:#cbd5e1;">Hi {{{contact.first_name|there}}},</p>
          <p style="margin:8px 0 18px;font-size:15px;line-height:1.55;color:#94a3b8;">${summary}</p>

          ${factsBlock}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
            <tr>
              <td align="center" style="background:#2563eb;border-radius:12px;">
                <a href="${videoUrl}" style="display:block;padding:14px 20px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                  &#9654;&nbsp; Watch the win story
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8;">Educational recap only — not investment advice.</p>
          <p style="margin:0 0 20px;font-size:13px;">
            <a href="${site}" style="color:#60a5fa;text-decoration:none;font-weight:600;">See live wall + max-pain zones &#8594;</a>
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-top:1px solid rgba(96,165,250,0.2);padding-top:16px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                Don&apos;t want these updates?
                <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#cbd5e1;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function alreadySent(contentId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const doc = await db.collection(EMAIL_BLASTS_COLLECTION).doc(`sr-audit_${contentId}`).get();
  if (!doc.exists) return false;
  const status = doc.data()?.status;
  return status === "sent" || status === "sending";
}

export async function sendSrAuditEmailBlast(
  input: SrAuditEmailBlastInput,
): Promise<SrAuditEmailBlastResult> {
  const cfg = resendConfig();
  if (!cfg.ready) {
    return { skipped: "resend_not_configured" };
  }
  if (!input.videoUrl?.trim()) {
    return { skipped: "missing_video_url" };
  }

  if (await alreadySent(input.contentId)) {
    return { skipped: "already_sent" };
  }

  const db = getAdminFirestore();
  const blastRef = db.collection(EMAIL_BLASTS_COLLECTION).doc(`sr-audit_${input.contentId}`);
  await blastRef.set(
    {
      source: "sr-audit",
      contentId: input.contentId,
      contentLabel: input.contentLabel,
      videoUrl: input.videoUrl,
      scheduleId: input.scheduleId ?? null,
      status: "sending",
      createdAt: new Date().toISOString(),
    },
    { merge: true },
  );

  try {
    const audience = await listFnoNinjaEmailAudience();
    if (audience.length === 0) {
      await blastRef.set(
        { status: "skipped", skipReason: "empty_audience", updatedAt: new Date().toISOString() },
        { merge: true },
      );
      return { skipped: "empty_audience", contactsSynced: 0 };
    }

    let contactsSynced = 0;
    let contactErrors = 0;

    for (let i = 0; i < audience.length; i += BATCH) {
      const chunk = audience.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (c) => {
          const r = await resendCreateContact({
            apiKey: cfg.apiKey,
            email: c.email,
            firstName: c.firstName ?? undefined,
            unsubscribed: false,
            segmentId: cfg.segmentId,
          });
          if (r.error) {
            contactErrors += 1;
            console.warn("[sr-audit-blast] contact sync failed", c.email, r.error);
          } else {
            contactsSynced += 1;
          }
        }),
      );
      if (i + BATCH < audience.length) await sleep(BATCH_DELAY_MS);
    }

    const subject = buildSrAuditEmailSubject(input.captions, input.contentLabel);
    const html = buildSrAuditEmailHtml({
      contentLabel: input.contentLabel,
      videoUrl: input.videoUrl,
      captions: input.captions,
    });

    const broadcast = await resendCreateAndSendBroadcast({
      apiKey: cfg.apiKey,
      segmentId: cfg.segmentId,
      from: cfg.from,
      subject,
      html,
    });

    if (broadcast.error) {
      await blastRef.set(
        {
          status: "failed",
          error: broadcast.error,
          contactsSynced,
          contactErrors,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { error: broadcast.error, contactsSynced, contactErrors };
    }

    await blastRef.set(
      {
        status: "sent",
        broadcastId: broadcast.id ?? null,
        subject,
        contactsSynced,
        contactErrors,
        audienceSize: audience.length,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { broadcastId: broadcast.id, contactsSynced, contactErrors };
  } catch (e) {
    const message = e instanceof Error ? e.message : "blast_failed";
    await blastRef.set(
      { status: "failed", error: message, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return { error: message };
  }
}

/**
 * Fire-and-forget wrapper for Buffer success paths. Never throws.
 */
export async function maybeSendSrAuditEmailBlast(
  input: SrAuditEmailBlastInput,
): Promise<SrAuditEmailBlastResult> {
  try {
    return await sendSrAuditEmailBlast(input);
  } catch (e) {
    const message = e instanceof Error ? e.message : "blast_failed";
    console.error("[sr-audit-blast]", message);
    return { error: message };
  }
}
