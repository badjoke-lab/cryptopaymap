export type VerificationStatus =
  | "owner" | "community" | "directory" | "unverified" | "" | null | undefined;

export const BADGE: Record<string, { label: string; cls: string; icon?: string }> = {
  owner:      { label: "Owner Verified", cls: "bg-blue-600/10 text-blue-700" },
  community:  { label: "Verified",       cls: "bg-slate-600/10 text-slate-700" },
  directory:  { label: "Verified",       cls: "bg-slate-600/10 text-slate-700" },
  unverified: { label: "Unverified",     cls: "bg-amber-500/15 text-amber-700", icon: "⚠︎ " },
  "":         { label: "", cls: "" },
};
export const badgeFor = (status?: string) =>
  BADGE[(status || "").toLowerCase()] || BADGE[""];
