import { canPreview, canPlayInline, isImage, isVideo, isPdf, humanSize } from '@/lib/uploads';
import { dateTime } from '@/lib/format';
import type { SignedDoc } from '@/lib/docs';
import { FileText, Film, Image as ImageIcon, ExternalLink, AlertTriangle } from 'lucide-react';

/**
 * The proof a technician attached, as the manager reviewing the job sees it.
 *
 * Three renderings rather than one, because "we accept this format" and "a
 * browser can display this format" are different questions:
 *
 *   - JPEG/PNG/WebP  -> inline thumbnail
 *   - MP4/WebM       -> inline player
 *   - HEIC/HEIF, MOV, PDF -> a file card with an Open link
 *
 * HEIC is the case that forces the split. It is the default iPhone camera
 * format, so it must be accepted, but only Safari renders it in an <img>.
 * Putting one in a thumbnail grid gives Chrome users a wall of broken images,
 * which looks like data loss rather than a format limitation.
 */
export function OrderDocs({ docs }: { docs: SignedDoc[] }) {
  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No files were attached to this job.
      </p>
    );
  }

  const previewable = docs.filter((d) => d.signedUrl && (canPreview(d) || canPlayInline(d)));
  const asFiles = docs.filter((d) => !d.signedUrl || (!canPreview(d) && !canPlayInline(d)));

  return (
    <div className="space-y-4">
      {previewable.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previewable.map((d) => (
            <li key={d.url} className="overflow-hidden rounded-lg border bg-muted/30">
              <a
                href={d.signedUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={`${d.name} · ${humanSize(d.size)}`}
              >
                {canPreview(d) ? (
                  // Plain <img>, not next/image: these are private, signed,
                  // expiring URLs. Routing them through the image optimiser
                  // would mean caching customer photos on the CDN.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.signedUrl!}
                    alt={d.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-opacity hover:opacity-90"
                  />
                ) : (
                  <video
                    src={d.signedUrl!}
                    controls
                    preload="metadata"
                    className="aspect-square w-full bg-black object-contain"
                  />
                )}
              </a>
              <p className="truncate px-2 py-1.5 text-xs text-muted-foreground" title={d.name}>
                {d.name}
              </p>
            </li>
          ))}
        </ul>
      )}

      {asFiles.length > 0 && (
        <ul className="space-y-2">
          {asFiles.map((d) => {
            const Icon = isPdf(d) ? FileText : isVideo(d) ? Film : ImageIcon;
            return (
              <li
                key={d.url}
                className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {humanSize(d.size)} · {dateTime(d.uploaded_at)}
                    {isImage(d) && ' · preview not supported in this browser'}
                  </span>
                </span>
                {d.signedUrl ? (
                  <a
                    href={d.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-muted"
                  >
                    Open
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                    title="The stored file could not be read"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden />
                    Unavailable
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {docs.length} {docs.length === 1 ? 'file' : 'files'} · links expire after an hour
      </p>
    </div>
  );
}
