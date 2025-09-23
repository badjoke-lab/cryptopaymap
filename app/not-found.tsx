// app/not-found.tsx
export default function NotFound(){
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <a className="text-blue-600 underline" href="/">Go Home</a>
    </div>
  );
}