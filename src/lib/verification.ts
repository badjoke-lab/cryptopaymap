export type VerificationStatus =
  | "owner"
  | "community"
  | "directory"
  | "unverified"
  | ""
  | null
  | undefined;

// ピンと整合する色設計（バッジ簡易版：一部UIで使用）
export const BADGE: Record<string, { label: string; cls: string; icon?: string }> = {
  owner:      { label: "Owner Verified",     cls: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30" },
  community:  { label: "Verified",           cls: "bg-blue-500/15  text-blue-700  ring-1 ring-inset ring-blue-500/30" },
  directory:  { label: "Verified",           cls: "bg-teal-500/15  text-teal-700  ring-1 ring-inset ring-teal-500/30" },
  unverified: { label: "Unverified",         cls: "bg-gray-400/20  text-gray-600  ring-1 ring-inset ring-gray-400/40", icon: "⚠︎ " },
  "":         { label: "",                    cls: "" },
};

export const badgeFor = (status?: string) =>
  BADGE[(status || "").toLowerCase()] || BADGE[""];
