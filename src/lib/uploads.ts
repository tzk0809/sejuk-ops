import type { OrderDoc } from '@/lib/types';

const MB = 1024 * 1024;

/**
 * The single source of truth for what may be uploaded.
 *
 * Imported by the browser file picker AND by the server action that mints signed
 * upload URLs, so the two cannot disagree about what is allowed. Duplicating
 * these numbers across the client and the server would be the obvious place for
 * the layers to drift apart — the same reason order validation shares one zod
 * schema.
 *
 * Limits are per type because a photo and a video are not the same problem: a
 * phone photo is 2-8 MB, while 30 seconds of 1080p is 50-100 MB. A single cap
 * generous enough for video would be far more headroom than an image needs.
 *
 * Enforced in three places, each catching what the others cannot:
 *   1. the picker, so a technician learns before spending upload time on a
 *      phone connection
 *   2. the server action, because a direct call never runs the picker
 *   3. the bucket's own file_size_limit and allowed_mime_types (0006). This one
 *      matters more than it looks: a signed upload URL is minted for a PATH, not
 *      a size, so a client could request a token declaring a 5 MB image and then
 *      PUT 40 MB to it. Only the bucket catches that lie.
 *
 * Plus the jsonb_array_length CHECK on orders.order_docs (0001) for the count.
 */
export const UPLOAD_RULES = {
  image: {
    maxBytes: 10 * MB,
    // heic/heif are the default iPhone camera formats. Without them every photo
    // from an iPhone is rejected, which is most of the field.
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },
  pdf: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf'],
  },
  video: {
    maxBytes: 50 * MB,
    // quicktime is .mov, what iPhone video produces. webm is a desktop
    // recording format phones do not generate, kept only for completeness.
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_RULES;

export const MAX_FILES = 6;

/** The bucket's single hard ceiling — the largest any rule allows. */
export const BUCKET_MAX_BYTES = Math.max(
  ...Object.values(UPLOAD_RULES).map((r) => r.maxBytes),
);

export const ACCEPTED_MIME: string[] = Object.values(UPLOAD_RULES).flatMap(
  (r) => [...r.mimeTypes],
);

/**
 * For the <input accept=""> attribute. Extensions are listed alongside MIME
 * types because a picker that only knows `image/heic` will grey out .heic files
 * on systems that do not map the extension to that MIME type.
 */
export const ACCEPT_ATTR = [
  ...ACCEPTED_MIME,
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.pdf',
].join(',');

export const BUCKET = 'order-docs';

/**
 * Extension fallback for when the browser reports no usable MIME type.
 *
 * This is not belt-and-braces, it is load-bearing. Windows derives MIME from the
 * registry, and `.heic` is usually not registered — so Chrome on Windows hands
 * back `file.type === ''` for the exact format iPhones produce. Matching on MIME
 * alone rejects the file the MIME list was extended to accept.
 *
 * Extension is the weaker signal (anyone can rename a file), which is why it is
 * only consulted when MIME is missing or unrecognised, and why the bucket's own
 * allowed_mime_types still has the final say on what is stored.
 */
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  pdf: 'application/pdf',
};

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

/** The MIME type to trust for this file: what the browser said, or what the name implies. */
export function effectiveMime(file: { name: string; type: string }): string {
  if (file.type && kindOfMime(file.type)) return file.type;
  return EXT_TO_MIME[extensionOf(file.name)] ?? file.type ?? '';
}

function kindOfMime(mimeType: string): UploadKind | null {
  for (const [kind, rule] of Object.entries(UPLOAD_RULES)) {
    if ((rule.mimeTypes as readonly string[]).includes(mimeType)) return kind as UploadKind;
  }
  return null;
}

export function kindOf(mimeType: string): UploadKind | null {
  return kindOfMime(mimeType);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
}

/** Returns a reason the file is unacceptable, or null if it is fine. */
export function rejectReason(file: { name: string; type: string; size: number }): string | null {
  const mime = effectiveMime(file);
  const kind = kindOfMime(mime);
  if (!kind) {
    const shown = file.type || extensionOf(file.name) || 'unknown';
    return `${file.name}: unsupported type (${shown}). Photos, video or PDF only.`;
  }
  const { maxBytes } = UPLOAD_RULES[kind];
  if (file.size > maxBytes) {
    return `${file.name}: ${humanSize(file.size)} is over the ${humanSize(maxBytes)} limit for ${kind === 'pdf' ? 'PDFs' : `${kind}s`}.`;
  }
  if (file.size === 0) return `${file.name}: file is empty.`;
  return null;
}

/** e.g. "images and PDFs up to 10 MB, video up to 50 MB" */
export function limitsSummary(): string {
  return `images and PDFs up to ${humanSize(UPLOAD_RULES.image.maxBytes)}, video up to ${humanSize(UPLOAD_RULES.video.maxBytes)}`;
}

/**
 * Storage path for one upload. Namespaced by order so a listing is meaningful,
 * and prefixed with a random segment so two files of the same name from the same
 * job cannot collide.
 */
export function storagePath(orderId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_').slice(-80);
  return `${orderId}/${crypto.randomUUID()}-${safe}`;
}

export const isImage = (doc: OrderDoc) => kindOf(doc.type) === 'image';
export const isVideo = (doc: OrderDoc) => kindOf(doc.type) === 'video';

/**
 * MIME types no mainstream browser will render in an <img> tag.
 *
 * HEIC/HEIF are the default iPhone camera formats, so they are accepted on
 * upload — refusing the format most field photos arrive in would be worse than
 * useless. But only Safari displays them inline: Chrome, Firefox and Edge show a
 * broken image. Accepting a format and being able to preview it are different
 * questions, and conflating them is how you ship a review screen full of broken
 * thumbnails.
 *
 * These are shown as a file card with an Open link instead. The browser then
 * downloads or hands the file to the OS, which knows what to do with it.
 *
 * Converting on upload (heic2any in the browser, or sharp on a server) would
 * give real thumbnails everywhere. Not built: it adds an image pipeline, a
 * second stored derivative per file, and a failure mode during upload, for a
 * preview convenience the spec never asks for.
 */
const NOT_PREVIEWABLE = ['image/heic', 'image/heif'];

export const canPreview = (doc: OrderDoc) =>
  isImage(doc) && !NOT_PREVIEWABLE.includes(doc.type);
