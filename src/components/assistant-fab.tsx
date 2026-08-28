'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AskWindow } from '@/components/ask-window';

/**
 * The assistant, as a floating button rather than a page of its own.
 *
 * The question a manager asks — "how many jobs today?" — is almost always
 * prompted by something they are already looking at. Sending them to a separate
 * route to ask it costs them the list they were reading, and they come back to
 * a page scrolled to the top with their filters intact but their place lost. A
 * panel over the current screen keeps the context that provoked the question.
 *
 * There is deliberately no separate route for it. A page would be a second
 * place to maintain, and the question is always asked in the context of a
 * screen the manager is already on.
 *
 * Rendered only for managers, and that is convenience — the server action and
 * runQuery each check the role independently. A hidden button is not a
 * permission.
 */
export function AssistantFab() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus goes back to the button that opened it — otherwise
  // a keyboard user is dropped at the top of the document with no way back.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Deferred a tick: the click that opened the panel is still propagating,
    // and would otherwise close it immediately.
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(id);
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="AI assistant"
          className="fixed bottom-24 right-6 z-50 flex max-h-[min(70vh,640px)] w-[min(28rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <p className="text-sm font-semibold">AI assistant</p>
            <button
              type="button"
              onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
              aria-label="Close the AI assistant"
              className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {/* Scrolls inside the panel: an answer listing 50 jobs must not push
              the input off the bottom of the viewport. Vertical padding lives on
              the children rather than here, so the sticky ask-form can span the
              full width and nothing shows through above it. */}
          <div className="overflow-y-auto px-4 pb-4">
            <AskWindow autoFocus compact />
          </div>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close the AI assistant' : 'Open the AI assistant'}
        className="group fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {/* A label on hover, because a lone icon in the corner of an operations
            tool does not say what it does. CSS rather than the `title`
            attribute: that one waits about a second, is styled by the OS, and
            never appears for a keyboard user — so this reveals on
            focus-visible too.

            Only while closed. Once the panel is open it is titled "AI
            assistant" three centimetres away, and the button's job has changed
            to closing it. */}
        {!open && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            AI assistant
          </span>
        )}
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>
    </>
  );
}
