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
  // ESCで閉じる
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
      {/* 背景オーバーレイ */}
      <div className="fixed inset-0 bg-black/40 z-[2999]" onClick={onClose} />

      {/* モーダル本体。relative にしてボタンの絶対配置の基準にする */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
        className="
          fixed right-0 top-0 h-[100dvh] w-[min(560px,92vw)]
          bg-white shadow-2xl border-l border-neutral-200
          flex flex-col z-[3000] relative
        "
      >
        {/* 見出し（stickyでもOK）。ボタンは別で absolute 配置する */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold truncate">{title}</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          {children}
        </div>

        {/* 閉じるボタン：asideを基準に右上へ固定。
            ページ固定ヘッダーと被らないよう、--cpm-header-h 分だけ下げる */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="
            absolute right-2 z-20
            inline-flex h-9 w-9 items-center justify-center
            rounded-full border border-neutral-300 bg-white
            hover:bg-neutral-50 active:bg-neutral-100
            focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-blue-600
          "
          style={{
            // 12px + ヘッダー高（未定義なら 0px）だけ下げる
            top: "calc(var(--cpm-header-h, 0px) + 12px)",
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </aside>
    </BodyPortal>
  );
}
