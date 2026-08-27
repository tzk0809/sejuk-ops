'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createUploadUrl, confirmUpload, removeUpload } from '@/app/actions/jobs';
import {
  ACCEPT_ATTR, MAX_FILES, effectiveMime, humanSize, limitsSummary, rejectReason,
  isImage, isVideo,
} from '@/lib/uploads';
import { Button } from '@/components/ui/button';
import type { OrderDoc } from '@/lib/types';
import { FileText, Film, Image as ImageIcon, X, Upload } from 'lucide-react';

type Pending = { name: string; pct: number };

/**
 * Files go BROWSER -> SUPABASE STORAGE directly, never through a server action.
 *
 * A Next server action caps request bodies at 1MB by default, and Vercel caps
 * function bodies at 4.5MB regardless of config — two phone photos would exceed
 * it. So the server only mints a one-shot signed token scoped to a path it
 * chose, and the browser PUTs to storage itself. The service_role key never
 * leaves the server, and the file never touches the serverless function.
 */
export function JobUploader({ orderId, docs }: { orderId: string; docs: OrderDoc[] }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [removing, startRemoving] = useTransition();

  // Toasts rather than an inline error list: rejections arrive one per file and
  // often across several picks, and an inline list either replaced the previous
  // batch (losing it) or grew forever with no way to dismiss. Toasts stack,
  // expire on their own, and do not push the form around.

  const remaining = MAX_FILES - docs.length - pending.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // let the same file be re-picked after an error
    if (picked.length === 0) return;

    const accepted: File[] = [];

    for (const f of picked) {
      // Checked here so the technician finds out before spending upload time on
      // a phone connection. The server checks again — this pass is UX only.
      const reason = rejectReason(f);
      if (reason) toast.error(reason);
      else if (accepted.length < remaining) accepted.push(f);
      else toast.error(`${f.name}: only ${MAX_FILES} files per job.`);
    }

    for (const file of accepted) {
      setPending((p) => [...p, { name: file.name, pct: 0 }]);

      // The type the browser reported may be empty (Windows + .heic), so the
      // resolved one is used everywhere the file's type is recorded.
      const mime = effectiveMime(file);

      const prep = await createUploadUrl(orderId, {
        name: file.name, type: mime, size: file.size,
      });
      if (!prep.ok) {
        toast.error(prep.message);
        setPending((p) => p.filter((x) => x.name !== file.name));
        continue;
      }

      try {
        await put(prep.signedUrl, file, mime, (pct) =>
          setPending((p) => p.map((x) => (x.name === file.name ? { ...x, pct } : x))),
        );
        const res = await confirmUpload(orderId, {
          url: prep.path,
          name: file.name,
          type: mime,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
        if (!res.ok) toast.error(res.message);
        else toast.success(`${file.name} attached`);
      } catch (err) {
        toast.error(`${file.name}: upload failed. ${(err as Error).message}`);
      } finally {
        setPending((p) => p.filter((x) => x.name !== file.name));
        router.refresh();
      }
    }
  }

  function onRemove(path: string) {
    startRemoving(async () => {
      const res = await removeUpload(orderId, path);
      if (!res.ok) toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Photos, video or PDF
          <span className="ml-1.5 font-normal text-muted-foreground">
            {docs.length} of {MAX_FILES}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{limitsSummary()}</span>
      </div>

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.url}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
            >
              {isImage(d) ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : isVideo(d) ? (
                <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{humanSize(d.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(d.url)}
                disabled={removing}
                aria-label={`Remove ${d.name}`}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending.map((p) => (
        <div key={p.name} className="rounded-lg border bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="text-xs text-muted-foreground">{p.pct}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${p.pct}%` }} />
          </div>
        </div>
      ))}

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={onPick}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-11 w-full"
        disabled={remaining <= 0}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-4" aria-hidden />
        {remaining <= 0 ? `${MAX_FILES} files attached` : 'Add files'}
      </Button>
    </div>
  );
}

/**
 * XHR rather than fetch: only XHR reports upload progress, and on a phone
 * connection a 20MB video with no feedback looks like a frozen app.
 */
function put(
  signedUrl: string,
  file: File,
  mime: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    // The resolved type, not file.type — storage rejects an empty content-type
    // against the bucket's allowed_mime_types list.
    xhr.setRequestHeader('content-type', mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage returned ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}
