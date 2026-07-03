'use client';

import { useEffect } from 'react';
import { sfx, preloadSfx } from '@/lib/sfx';

const SKIP_KEYS = new Set([
  'Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Escape',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function SfxProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    preloadSfx();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button:not([disabled])') || target.closest('a[href]')) {
        sfx.click();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || SKIP_KEYS.has(e.key)) return;
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping) sfx.key();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return <>{children}</>;
}
