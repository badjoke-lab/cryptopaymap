// app/global-error.tsx
"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html><body className="p-6">
      <h1 className="text-lg font-semibold">Unexpected error</h1>
      <p className="text-sm text-neutral-600">{error.message}</p>
      <button onClick={reset} className="mt-3 px-3 py-1 border rounded">Reload</button>
    </body></html>
  );
}