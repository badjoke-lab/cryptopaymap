// app/api/discover/route.ts
import { NextResponse } from "next/server";
import { getHotTopics } from "@/lib/discoverAdapter";

export const revalidate = 600;          // 10分キャッシュ
export const dynamic = "force-static";   // SSG + ISR

export async function GET() {
  const payload = await getHotTopics();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60" },
  });
}
