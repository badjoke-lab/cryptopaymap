"use client";
import { useEffect } from "react";

export default function FilterFab({ count = 0, onOpen }: { count?: number; onOpen: () => void; }) {
  useEffect(() => { /* no-op */ }, []);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="md:hidden fixed right-3 top-[calc(var(--cpm-header-h)+8px)] h-12 px-4 rounded-full shadow-lg bg-white text-sm font-medium z-fab"
      aria-label="Open filters"
    >
      Filters{count ? ` (${count})` : ""}
    </button>
  );
}
