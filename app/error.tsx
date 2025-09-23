// app/error.tsx
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Something went wrong.</h1>
      <p className="text-sm text-neutral-600">{error.message}</p>
      <button onClick={reset} className="px-3 py-1 border rounded">Try again</button>
    </div>
  );
}