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

function bodyParagraph(
  captions: Partial<Record<SocialPlatformId, string>>,
  contentLabel: string,
): string {
  const fb = captions.facebook?.trim();
  if (fb) {
    // Drop hashtag / CTA / disclaimer lines for a cleaner email body.
    const lines = fb
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
          l !== "🎯",
      );
    const text = lines.slice(0, 4).join(" ").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return `${contentLabel} — watch the win-story recap.`;
}

export function buildSrAuditEmailHtml(input: {
  contentLabel: string;
  videoUrl: string;
  captions: Partial<Record<SocialPlatformId, string>>;
}): string {
  const para = escapeHtml(bodyParagraph(input.captions, input.contentLabel));
  const label = escapeHtml(input.contentLabel);
  const videoUrl = escapeHtml(input.videoUrl);
  const site = escapeHtml(WEBSITE);

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#0d1830;border:1px solid rgba(90,140,220,0.25);border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;">FNO Ninja</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#fff;">${label}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#cbd5e1;">Hi {{{contact.first_name|there}}},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#cbd5e1;">${para}</p>
          <p style="margin:0 0 28px;">
            <a href="${videoUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">▶ Watch the win story</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#94a3b8;">Educational recap only — not investment advice.</p>
          <p style="margin:0 0 24px;font-size:13px;"><a href="${site}" style="color:#60a5fa;text-decoration:none;">See live wall + max-pain zones → ${site}</a></p>
          <hr style="border:none;border-top:1px solid rgba(90,140,220,0.2);margin:20px 0;" />
          <p style="margin:0;font-size:11px;line-height:1.5;color:#64748b;">
            Don&apos;t want these updates?
            <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#94a3b8;">Unsubscribe</a>
          </p>
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
