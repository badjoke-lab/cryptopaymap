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
      {/* 背景 */}
      <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={onClose} />

      {/* ドロワー本体（位置はそのまま） */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
        className="fixed right-0 top-0 h-[100dvh] w-[min(520px,92vw)]
                   bg-white shadow-2xl border-l border-neutral-200
                   flex flex-col z-[2000] relative"
      >
        {/* フローティング閉じるボタン（赤丸の位置） */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute w-10 h-10 rounded-full bg-white border shadow
                     flex items-center justify-center text-[18px] hover:bg-neutral-50"
          style={{
            // ページヘッダーの高さ + 8px 分だけ下げて、右端から 12px
            top: "calc(var(--cpm-header-h, 56px) + 8px)",
            right: 12,
            zIndex: 5,
          }}
        >
          ✕
        </button>

        {/* タイトル行（閉じるボタンはここには置かない） */}
        <div className="sticky top-0 z-[1] px-4 py-3 border-b bg-white">
          <h2 className="text-base font-semibold truncate">{title}</h2>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {children}
        </div>
      </aside>
    </BodyPortal>
  );
}
