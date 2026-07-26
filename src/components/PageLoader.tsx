export function PageLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-6 text-sm text-content-subtle">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-500 [animation-delay:0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.3s]" />
      </span>
      {text}
    </div>
  );
}
