// components/VerificationBadge.tsx
import React from "react";

type Verification = "owner" | "community" | "directory" | "unverified" | "unknown";

const LABEL: Record<Verification, { text: string; title: string }> = {
  owner:      { text: "Owner Verified",     title: "Owner submitted & verified" },
  community:  { text: "Community Verified", title: "Community submitted & verified" },
  directory:  { text: "Directory Listed",   title: "Directory sourced (not owner-submitted)" },
  unverified: { text: "Unverified",         title: "Not yet verified" },
  unknown:    { text: "Unknown",            title: "Verification status unknown" },
};

// 統一カラーパレット（ピン色と一致）
// owner:      Amber 500
// community:  Blue 500
// directory:  Teal 500
// unverified: Gray 400
const COLOR: Record<Verification, string> = {
  owner:      "bg-amber-500/15 text-amber-700 ring-amber-500/30",
  community:  "bg-blue-500/15  text-blue-700  ring-blue-500/30",
  directory:  "bg-teal-500/15  text-teal-700  ring-teal-500/30",
  unverified: "bg-gray-400/20  text-gray-600  ring-gray-400/40",
  unknown:    "bg-gray-100     text-gray-700  ring-gray-300/60",
};

export function VerificationBadge({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const st = (status as Verification) || "unknown";
  const key: Verification =
    (["owner", "community", "directory", "unverified"] as const).includes(st as any)
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
        {key === "owner"
          ? "👑"
          : key === "community"
          ? "⭐"
          : key === "directory"
          ? "📂"
          : key === "unverified"
          ? "⚠️"
          : "❔"}
      </span>
      {text}
    </span>
  );
}
