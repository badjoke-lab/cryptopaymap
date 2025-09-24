// components/SideModal.tsx
"use client";

import { useEffect } from "react";
import ReactDOM from "react-dom";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

function BodyPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(children as any, document.body);
}

export default function SideModal({ open, title = "Details", onClose, children }: Props) {
  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 背景スクロール抑止
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <BodyPortal>
      {/* overlay */}
      <div className="fixed inset-0 bg-black/40 z-[1990]" onClick={onClose} />

      {/* panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
        className="
          fixed right-0 top-0 h-[100dvh] w-[min(560px,92vw)]
          bg-white shadow-2xl border-l border-neutral-200
          flex flex-col z-[2000]
        "
      >
        {/* sticky header */}
        <div
          className="
            sticky top-0 z-10 bg-white/95 backdrop-blur
            border-b border-neutral-200
            px-4 pr-14 py-3
          "
        >
          <h2 className="text-base font-semibold truncate">{title}</h2>

          {/* Close button (always visible, absolute) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
              absolute top-2 right-2
              inline-flex h-9 w-9 items-center justify-center
              rounded-full border border-neutral-300
              hover:bg-neutral-50 active:bg-neutral-100
              focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-blue-600
            "
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {children}
        </div>
      </aside>
    </BodyPortal>
  );
}
