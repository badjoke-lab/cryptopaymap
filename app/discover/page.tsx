// app/discover/page.tsx
import Link from "next/link";
import { getHotTopics } from "@/lib/discoverAdapter";

export const revalidate = 600; // 10分ISR

export default async function DiscoverPage() {
  const { topics } = await getHotTopics();

  return (
    <main style={{ padding: "24px 20px 60px" }}>
      <h1 style={{ fontSize: 42, fontWeight: 700, margin: "6px 0 24px" }}>Discover</h1>

      <h2 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 14px" }}>Hot Topics</h2>

      {topics.length === 0 ? (
        <p>No hot topics yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
            marginTop: 8,
          }}
        >
          {topics.map((t, i) => (
            <Link
              key={i}
              href={t.url}
              style={{
                display: "block",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
                textDecoration: "none",
              }}
            >
              <div style={{ fontWeight: 700, color: "#111827", lineHeight: 1.25 }}>{t.title}</div>
              {t.subtitle && <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>{t.subtitle}</div>}
              {t.published_at && (
                <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 12 }}>
                  {new Date(t.published_at).toLocaleString()}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <p style={{ marginTop: 28, color: "#6b7280" }}>
        Data sources: OpenStreetMap contributors. Use at your own risk. No warranty.
      </p>
    </main>
  );
}
