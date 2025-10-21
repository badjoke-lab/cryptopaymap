// src/lib/ref.ts
export function makeRef(kind: "owner" | "community" | "report"): string {
  const pad = (n: number) => String(n).padStart(4, "0");
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = pad(Math.floor(Math.random() * 10000));
  return `${kind}-${y}${m}${day}-${rand}`;
}
