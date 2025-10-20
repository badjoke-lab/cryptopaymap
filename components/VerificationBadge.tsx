// components/VerificationBadge.tsx
import React from "react";

type Verification = "owner" | "community" | "directory" | "unverified" | "unknown";

const LABEL: Record<Verification, { text: string; title: string }> = {
  owner: { text: "Owner Verified", title: "Owner submitted & verified" },
  community: { text: "Community Verified", title: "Community submitted & verified" },
  directory: { text: "Directory Listed", title: "Directory sourced (not owner-submitted)" },
  unverified: { text: "Unverified", title: "Not yet verified" },
  unknown: { text: "Unknown", title: "Verification status unknown" },
};

const COLOR: Record<Verification, string> = {
  owner: "bg-yellow-300/90 text-zinc-900 ring-yellow-600/50",
  community: "bg-zinc-200 text-zinc-800 ring-zinc-400/60",
  directory: "bg-zinc-100 text-zinc-700 ring-zinc-300/60",
  unverified: "bg-amber-100 text-amber-900 ring-amber-400/60",
  unknown: "bg-zinc-100 text-zinc-700 ring-zinc-300/60",
};

export function VerificationBadge({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const st = (status as Verification) || "unknown";
  const key: Verification = (["owner", "community", "directory", "unverified"] as const).includes(
    st as any
  )
    ? (st as Verification)
    : "unknown";

  const { text, title } = LABEL[key];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ring-1 ring-inset ${COLOR[key]} ${className}`}
      data-badge={key}
      role="img"
      aria-label={text}
      title={title}
    >
      {/* 冗長符号化（色＋アイコン＋テキスト） */}
      <span aria-hidden="true">
        {key === "owner" ? "👑" : key === "community" ? "⭐" : key === "directory" ? "📂" : key === "unverified" ? "⚠️" : "❔"}
      </span>
      {text}
    </span>
  );
}
