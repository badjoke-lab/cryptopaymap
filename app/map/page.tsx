"use client";
import nextDynamic from "next/dynamic";
export const dynamic = "force-dynamic";

const MapShell = nextDynamic(() => import("../../components/MapShell"), { ssr: false });

export default function MapPage() {
  return (
    <main className="min-h-[100dvh]">
      <div className="h-[100dvh]">
        <MapShell />
      </div>
    </main>
  );
}
