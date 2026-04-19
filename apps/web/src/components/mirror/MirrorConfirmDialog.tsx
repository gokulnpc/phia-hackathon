"use client";

import { useCallback, useEffect, useId, useRef } from "react";

export type MirrorConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
};

export function MirrorConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Remove",
  cancelLabel = "Cancel",
  pending = false,
  onConfirm,
}: MirrorConfirmDialogProps): JSX.Element | null {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    if (pending) return;
    onOpenChange(false);
  }, [onOpenChange, pending]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm"
        onClick={pending ? undefined : close}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[1] w-full max-w-md rounded-mirror border border-borderMirror bg-white p-6 shadow-mirror-lg"
      >
        <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={close}
            className="rounded-full border border-borderMirror bg-white px-5 py-2.5 text-sm font-semibold text-charcoal shadow-mirror-sm transition hover:border-rose hover:text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              onConfirm();
            }}
            className="rounded-full border-2 border-rose bg-white px-5 py-2.5 text-sm font-semibold text-deep shadow-mirror-sm transition hover:bg-blush/30 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
