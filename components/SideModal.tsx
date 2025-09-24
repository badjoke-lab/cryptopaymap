// components/SideModal.tsx
"use client";

import React, { useEffect } from "react";
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

export default function SideModal({
  open,
  title = "Details",
  onClose,
  children,
}: Props) {
  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 背景スクロール固定
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <BodyPortal>
      {/* 背景オーバーレイ（パネルより下） */}
      <div className="fixed inset-0 bg-black/30 z-[2000]" onClick={onClose} />

      {/* 右側ドロワー（従来どおり top:0） */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
        className="fixed right-0 top-0 h-[100dvh] w-[min(520px,92vw)]
                   bg-white shadow-2xl border-l border-neutral-200
                   flex flex-col z-[2001]"
      >
        {/* 画面読み上げ用タイトル（ヘッダーUIは消す） */}
        <h2 className="sr-only">{title}</h2>

        {/* ヘッダー高さぶんだけ上に余白を入れて内容を始める */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4"
             style={{ paddingTop: "calc(var(--cpm-header-h,56px) + 16px)" }}>
          {children}
        </div>
      </aside>

      {/* フローティングの“×”（赤丸位置）。ヘッダー下に固定、常に最前面 */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed z-[2002] rounded-full border shadow bg-white/95 hover:bg-white"
        style={{
          top: "calc(var(--cpm-header-h,56px) + 12px)",
          right: 16,
          width: 36,
          height: 36,
          lineHeight: "36px",
          textAlign: "center",
          fontSize: 18,
        }}
      >
        ✕
      </button>
    </BodyPortal>
  );
}
