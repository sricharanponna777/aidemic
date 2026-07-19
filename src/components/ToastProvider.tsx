'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X } from 'lucide-react';

type ToastTone = 'info' | 'success' | 'warning' | 'error';
type Toast = { id: number; tone: ToastTone; text: string };

type ToastContextValue = {
  showToast: (tone: ToastTone, text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/70 dark:bg-blue-950/90 dark:text-blue-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/90 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/90 dark:text-amber-200',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/90 dark:text-red-200',
};

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (tone: ToastTone, text: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, text }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-xl ${TOAST_STYLES[t.tone]}`}
          >
            <p className="flex-1">{t.text}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
