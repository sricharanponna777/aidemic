const dotClass = 'h-2 w-2 animate-bounce rounded-full';

/** Three bouncing dots — the app's standard loading indicator. */
export function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5" role="status" aria-label="Loading">
      <div className={`${dotClass} bg-indigo-500`} />
      <div className={`${dotClass} bg-purple-500 [animation-delay:0.15s]`} />
      <div className={`${dotClass} bg-fuchsia-500 [animation-delay:0.3s]`} />
    </div>
  );
}

/** Full-viewport centered loading state, matching the app background. */
export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] dark:bg-[#0A0F1E]">
      <LoadingDots />
    </main>
  );
}
