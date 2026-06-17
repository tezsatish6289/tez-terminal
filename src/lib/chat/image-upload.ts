/**
 * Server-side image handling for community chat (shared screenshots).
 *
 * All uploads are server-mediated (clients cannot write to Storage directly).
 * We validate by magic bytes, re-encode with sharp to strip EXIF/embedded
 * payloads and cap dimensions, then store the result in Cloud Storage with a
 * Firebase download token. The persisted {@link ChatAttachment} metadata is the
 * authoritative record copied onto the message.
 */

import { randomUUID } from "node:crypto";
import { getAdminStorageBucket } from "@/firebase/admin";
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_DIMENSION,
} from "@/lib/chat/constants";
import type { ChatAttachment } from "@/lib/chat/types";

const OUTPUT_CONTENT_TYPE = "image/webp";

/** Detect a supported raster image from its leading bytes (don't trust mime). */
function sniffImageType(buf: Buffer): "png" | "jpeg" | "webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function storagePath(roomId: string, uid: string, id: string): string {
  return `chat/${roomId}/${uid}/${id}.webp`;
}

function downloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path,
  )}?alt=media&token=${token}`;
}

export interface ProcessImageResult {
  attachment?: ChatAttachment;
  error?: string;
}

/**
 * Validate, re-encode and upload one chat image. Returns the persisted
 * attachment metadata, or a user-facing error string.
 */
export async function processAndUploadChatImage(args: {
  roomId: string;
  uid: string;
  buffer: Buffer;
}): Promise<ProcessImageResult> {
  const { roomId, uid, buffer } = args;

  if (buffer.length === 0) return { error: "Empty file." };
  if (buffer.length > CHAT_IMAGE_MAX_BYTES) {
    return { error: `Image exceeds ${Math.round(CHAT_IMAGE_MAX_BYTES / (1024 * 1024))}MB.` };
  }
  if (!sniffImageType(buffer)) {
    return { error: "Unsupported image. Use PNG, JPEG or WebP." };
  }

  let output: Buffer;
  let width: number;
  let height: number;
  try {
    // Lazy-load sharp so a native-binary load failure is catchable here (and
    // doesn't break the whole route module at import time).
    const sharp = (await import("sharp")).default;
    // `sharp` drops all metadata by default (no withMetadata()), stripping EXIF
    // and any embedded payloads. Rotate first so display orientation is baked in.
    const pipeline = sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({
        width: CHAT_IMAGE_MAX_DIMENSION,
        height: CHAT_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    output = data;
    width = info.width;
    height = info.height;
  } catch (e) {
    console.error("[chat] image processing failed", e);
    const detail = e instanceof Error ? e.message : "unknown";
    return { error: `Could not process image (${detail}).` };
  }

  const id = randomUUID();
  const path = storagePath(roomId, uid, id);
  const token = randomUUID();
  const bucket = getAdminStorageBucket();

  try {
    await bucket.file(path).save(output, {
      resumable: false,
      contentType: OUTPUT_CONTENT_TYPE,
      metadata: {
        contentType: OUTPUT_CONTENT_TYPE,
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {
          firebaseStorageDownloadTokens: token,
          chatRoomId: roomId,
          chatAuthorId: uid,
          width: String(width),
          height: String(height),
        },
      },
    });
  } catch (e) {
    console.error("[chat] image upload failed", e);
    const detail = e instanceof Error ? e.message : "unknown";
    return { error: `Storage write failed (${detail}).` };
  }

  return {
    attachment: {
      path,
      url: downloadUrl(bucket.name, path, token),
      mimeType: OUTPUT_CONTENT_TYPE,
      width,
      height,
      sizeBytes: output.length,
    },
  };
}

/**
 * Re-read an already-uploaded chat image's authoritative metadata. The send
 * route uses this to verify a client-supplied attachment path actually exists,
 * belongs to the right room/author, and to rebuild trusted metadata rather than
 * trusting the client payload.
 */
export async function resolveUploadedAttachment(args: {
  roomId: string;
  uid: string;
  path: string;
}): Promise<ChatAttachment | null> {
  const { roomId, uid, path } = args;

  // Path must live under this user's folder for this room.
  if (path !== "" && !path.startsWith(`chat/${roomId}/${uid}/`)) return null;

  const bucket = getAdminStorageBucket();
  const file = bucket.file(path);

  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    const custom = (meta.metadata ?? {}) as Record<string, string>;
    const token = custom.firebaseStorageDownloadTokens?.split(",")[0] ?? "";
    if (!token) return null;
    const contentType = meta.contentType ?? "image/webp";
    if (!contentType.startsWith("image/")) return null;

    return {
      path,
      url: downloadUrl(bucket.name, path, token),
      mimeType: contentType,
      width: Number(custom.width) || 0,
      height: Number(custom.height) || 0,
      sizeBytes: Number(meta.size) || 0,
    };
  } catch (e) {
    console.error("[chat] attachment resolve failed", path, e);
    return null;
  }
}

/** Best-effort delete of attachment objects (on message delete/moderation). */
export async function deleteAttachmentObjects(attachments: ChatAttachment[] | undefined): Promise<void> {
  if (!attachments?.length) return;
  const bucket = getAdminStorageBucket();
  await Promise.all(
    attachments.map((a) =>
      bucket
        .file(a.path)
        .delete({ ignoreNotFound: true })
        .catch((e) => console.error("[chat] attachment delete failed", a.path, e)),
    ),
  );
}
