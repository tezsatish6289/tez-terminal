/**
 * Buffer GraphQL API client (new API at https://api.buffer.com).
 *
 * We use a personal API key (Bearer token) — set BUFFER_API_KEY. This is the
 * single-account / single-organization model that fits the TezTerminal brand
 * (no multi-tenant OAuth needed). The key is created at
 * https://publish.buffer.com/settings/api and lives in env / Secret Manager.
 *
 * Buffer has NO file-upload endpoint: media is referenced by a public, stable
 * URL (see video-storage.ts). Posts are created one-per-channel, which is why
 * per-channel captions are natural here.
 *
 * Docs: https://developers.buffer.com  ·  https://buffer.com/api
 */

const BUFFER_ENDPOINT = "https://api.buffer.com";

export class BufferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BufferError";
  }
}

function apiKey(): string {
  const key = process.env.BUFFER_API_KEY?.trim();
  if (!key) {
    throw new BufferError(
      "Buffer not configured. Add BUFFER_API_KEY (personal key from publish.buffer.com/settings/api) to the environment.",
    );
  }
  return key;
}

/** Low-level GraphQL POST. Throws BufferError on transport or GraphQL errors. */
async function bufferRequest<T>(query: string): Promise<T> {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  let json: { data?: T; errors?: Array<{ message?: string }> };
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new BufferError(`Buffer returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const msg = json.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new BufferError(msg || `Buffer API error (HTTP ${res.status})`);
  }
  if (json.errors?.length) {
    throw new BufferError(json.errors.map((e) => e.message).filter(Boolean).join("; ") || "Buffer GraphQL error");
  }
  if (!json.data) throw new BufferError("Buffer returned an empty response.");
  return json.data;
}

// ─── Account / Organization ──────────────────────────────────────────

let _orgIdCache: { id: string; at: number } | null = null;
const ORG_TTL_MS = 10 * 60_000;

/** The first organization on the account (single-brand assumption). Cached. */
export async function getOrganizationId(): Promise<string> {
  if (_orgIdCache && Date.now() - _orgIdCache.at < ORG_TTL_MS) return _orgIdCache.id;

  const data = await bufferRequest<{
    account?: { organizations?: Array<{ id: string }> };
  }>(`query { account { organizations { id name } } }`);

  const id = data.account?.organizations?.[0]?.id;
  if (!id) throw new BufferError("No Buffer organization found for this API key.");
  _orgIdCache = { id, at: Date.now() };
  return id;
}

// ─── Channels ────────────────────────────────────────────────────────

export interface BufferChannel {
  id: string;
  name: string;
  /** Buffer service slug, e.g. "twitter" | "facebook" | "instagram" | "linkedin" | "youtube". */
  service: string;
}

/** All connected channels on the account's first organization. */
export async function listChannels(): Promise<BufferChannel[]> {
  const orgId = await getOrganizationId();
  const data = await bufferRequest<{ channels?: BufferChannel[] }>(
    `query { channels(input: { organizationId: ${JSON.stringify(orgId)} }) { id name service } }`,
  );
  return data.channels ?? [];
}

// ─── Create post ─────────────────────────────────────────────────────

export type BufferShareMode = "customScheduled" | "shareNow" | "addToQueue";

export interface CreateBufferPostInput {
  channelId: string;
  text: string;
  /** Public, stable (non-expiring) URL ending in .mp4 — Buffer fetches it at publish time. */
  videoUrl: string;
  thumbnailUrl?: string;
  /** Required for customScheduled — ISO-8601 UTC (e.g. 2026-06-29T03:42:00Z). */
  dueAt?: string;
  mode?: BufferShareMode;
}

/**
 * Create a single post on one channel with a video asset. Returns the Buffer
 * post id. `schedulingType: automatic` = auto-publish (not a reminder); on a
 * single-user Essentials account this publishes without an approval step.
 */
export async function createBufferPost(input: CreateBufferPostInput): Promise<{ postId: string }> {
  const mode: BufferShareMode = input.mode ?? (input.dueAt ? "customScheduled" : "shareNow");
  const videoAsset = input.thumbnailUrl
    ? `{ video: { url: ${JSON.stringify(input.videoUrl)}, thumbnailUrl: ${JSON.stringify(input.thumbnailUrl)} } }`
    : `{ video: { url: ${JSON.stringify(input.videoUrl)} } }`;

  const fields = [
    `channelId: ${JSON.stringify(input.channelId)}`,
    `text: ${JSON.stringify(input.text)}`,
    `schedulingType: automatic`,
    `mode: ${mode}`,
    input.dueAt ? `dueAt: ${JSON.stringify(input.dueAt)}` : null,
    `saveToDraft: false`,
    `assets: [${videoAsset}]`,
  ]
    .filter(Boolean)
    .join("\n        ");

  const query = `mutation {
    createPost(input: {
        ${fields}
    }) {
      ... on PostActionSuccess { post { id status } }
      ... on MutationError { message }
    }
  }`;

  const data = await bufferRequest<{
    createPost?: { post?: { id: string; status?: string }; message?: string };
  }>(query);

  const result = data.createPost;
  if (result?.message) throw new BufferError(result.message);
  const postId = result?.post?.id;
  if (!postId) throw new BufferError("Buffer did not return a post id.");
  return { postId };
}
