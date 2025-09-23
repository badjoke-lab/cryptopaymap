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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
        className="fixed right-0 top-0 h-[100dvh] w-[min(520px,92vw)]
                   bg-white shadow-2xl border-l border-neutral-200
                   flex flex-col z-[2000]"
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3
                        px-4 py-3 border-b bg-white">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-neutral-50"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {children}
        </div>
      </aside>
    </BodyPortal>
  );
}
