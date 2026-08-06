/**
 * Thin Resend HTTP client (Broadcasts + Contacts). No SDK dependency.
 * Marketing blasts must use Broadcasts — not transactional emails.send.
 */

import "server-only";

const RESEND_API = "https://api.resend.com";

export function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const segmentId = process.env.RESEND_SEGMENT_ID?.trim() ?? "";
  const from = process.env.RESEND_FROM?.trim() ?? "";
  const enabled =
    (process.env.RESEND_SR_AUDIT_EMAIL ?? "true").trim().toLowerCase() !== "false";
  return {
    apiKey,
    segmentId,
    from,
    enabled,
    ready: Boolean(apiKey && segmentId && from && enabled),
  };
}

async function resendFetch<T>(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const { apiKey, ...rest } = init;
  const res = await fetch(`${RESEND_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : text) || `Resend HTTP ${res.status}`;
    return { ok: false, status: res.status, message };
  }
  return { ok: true, data: json as T };
}

export async function resendCreateContact(input: {
  apiKey: string;
  email: string;
  firstName?: string;
  unsubscribed?: boolean;
  segmentId?: string;
}): Promise<{ id?: string; created: boolean; error?: string }> {
  const body: Record<string, unknown> = {
    email: input.email,
    unsubscribed: input.unsubscribed ?? false,
  };
  if (input.firstName) body.first_name = input.firstName;
  if (input.segmentId) body.segments = [{ id: input.segmentId }];

  const created = await resendFetch<{ id?: string }>(`/contacts`, {
    apiKey: input.apiKey,
    method: "POST",
    body: JSON.stringify(body),
  });

  if (created.ok) return { id: created.data.id, created: true };

  // Already exists — update + ensure segment membership.
  if (created.status === 409 || /already|exists/i.test(created.message)) {
    const patched = await resendFetch<{ id?: string }>(
      `/contacts/${encodeURIComponent(input.email)}`,
      {
        apiKey: input.apiKey,
        method: "PATCH",
        body: JSON.stringify({
          first_name: input.firstName || undefined,
          unsubscribed: input.unsubscribed ?? false,
        }),
      },
    );
    if (input.segmentId) {
      await resendFetch(`/contacts/${encodeURIComponent(input.email)}/segments/${input.segmentId}`, {
        apiKey: input.apiKey,
        method: "POST",
        body: "{}",
      });
    }
    if (!patched.ok) return { created: false, error: patched.message };
    return { id: patched.data.id, created: false };
  }

  return { created: false, error: created.message };
}

export async function resendSetContactUnsubscribed(input: {
  apiKey: string;
  email: string;
  unsubscribed: boolean;
  segmentId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const patched = await resendFetch(`/contacts/${encodeURIComponent(input.email)}`, {
    apiKey: input.apiKey,
    method: "PATCH",
    body: JSON.stringify({ unsubscribed: input.unsubscribed }),
  });

  if (!patched.ok && patched.status !== 404) {
    return { ok: false, error: patched.message };
  }

  if (input.segmentId) {
    if (input.unsubscribed) {
      await resendFetch(
        `/contacts/${encodeURIComponent(input.email)}/segments/${input.segmentId}`,
        { apiKey: input.apiKey, method: "DELETE" },
      );
    } else {
      await resendFetch(
        `/contacts/${encodeURIComponent(input.email)}/segments/${input.segmentId}`,
        { apiKey: input.apiKey, method: "POST", body: "{}" },
      );
    }
  }

  return { ok: true };
}

export async function resendCreateAndSendBroadcast(input: {
  apiKey: string;
  segmentId: string;
  from: string;
  subject: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  const result = await resendFetch<{ id?: string }>(`/broadcasts`, {
    apiKey: input.apiKey,
    method: "POST",
    body: JSON.stringify({
      segment_id: input.segmentId,
      from: input.from,
      subject: input.subject,
      html: input.html,
      send: true,
    }),
  });
  if (!result.ok) return { error: result.message };
  return { id: result.data.id };
}

/** Transactional one-to-one email (trial lifecycle, not marketing broadcasts). */
export async function resendSendEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  const result = await resendFetch<{ id?: string }>(`/emails`, {
    apiKey: input.apiKey,
    method: "POST",
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!result.ok) return { error: result.message };
  return { id: result.data.id };
}
