/**
 * Host a rendered MP4 at a public, STABLE URL for Buffer.
 *
 * Buffer fetches the media at publish time (hours/days later) and rejects
 * *expiring* URLs. We use Firebase Storage **download-token URLs**:
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<uuid>
 * These are permanent (the token never expires unless revoked), publicly
 * fetchable without auth, and only expose the single tokenized object — so the
 * default app bucket's private files stay private. This needs NO public IAM,
 * no org-policy change, and works with uniform bucket-level access.
 *
 * Because we hand Buffer the URL inside a `video: {}` asset, Buffer treats it
 * as a video regardless of the URL not ending in `.mp4`.
 *
 * Cleanup (deleting old MP4s after they've published) is a separate cron concern.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminStorageBucket } from "@/firebase/admin";
import type { Bucket } from "@google-cloud/storage";

/** Override the bucket via SOCIAL_VIDEO_BUCKET; otherwise the default app bucket. */
function socialBucket(): Bucket {
  const name = process.env.SOCIAL_VIDEO_BUCKET?.trim();
  return name ? getStorage().bucket(name) : getAdminStorageBucket();
}

export interface UploadedVideo {
  /** Permanent, publicly fetchable Firebase download URL (token-based). */
  url: string;
  /** Object path within the bucket. */
  path: string;
  bucket: string;
}

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "video";
}

/**
 * Upload MP4 bytes to `social-videos/<source>/<id>-<ts>.mp4` with a download
 * token and return its permanent public URL. `source` groups by content type
 * (e.g. "videos", "sr-audit"); `id` is the topic/story id.
 */
export async function uploadPublicMp4(
  bytes: Buffer | Uint8Array,
  opts: { source: string; id: string },
): Promise<UploadedVideo> {
  const bucket = socialBucket();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `social-videos/${safeSegment(opts.source)}/${safeSegment(opts.id)}-${ts}.mp4`;
  const file = bucket.file(path);
  const token = randomUUID();

  await file.save(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), {
    resumable: false,
    contentType: "video/mp4",
    metadata: {
      cacheControl: "public, max-age=86400",
      // The presence of a download token is what makes the firebasestorage.app
      // download endpoint serve this object publicly (token-scoped, no IAM).
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

  return { url, path, bucket: bucket.name };
}

/**
 * Upload PNG bytes to `social-images/<source>/<id>-<ts>.png` with a download
 * token and return its permanent public URL — same token scheme as the MP4
 * helper, so Buffer can fetch it at publish time.
 */
export async function uploadPublicPng(
  bytes: Buffer | Uint8Array,
  opts: { source: string; id: string },
): Promise<UploadedVideo> {
  const bucket = socialBucket();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `social-images/${safeSegment(opts.source)}/${safeSegment(opts.id)}-${ts}.png`;
  const file = bucket.file(path);
  const token = randomUUID();

  await file.save(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), {
    resumable: false,
    contentType: "image/png",
    metadata: {
      cacheControl: "public, max-age=86400",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  return { url, path, bucket: bucket.name };
}
