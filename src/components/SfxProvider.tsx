'use client';

import { useEffect } from 'react';
import { sfx } from '@/lib/sfx';

export function SfxProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button:not([disabled])') || target.closest('a[href]')) {
        sfx.click();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return <>{children}</>;
}
