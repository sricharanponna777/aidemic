'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'aidemic-sfx-muted';

export function useSfxMuted() {
  const [muted, setMutedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  return { muted, setMuted, toggleMuted };
}
