'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'aidemic-theme';
type ThemeMode = 'light' | 'dark';

function getPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Storage blocked (private mode, cookie-blocking settings). The choice
    // still applies for this session via the shared value below; it just
    // can't survive a reload.
    return null;
  }
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

// One value shared by every consumer. Each useTheme() used to own its own
// useState, so a component mounting later — the Settings page, mounting under
// a header that already had one — re-derived the theme from scratch instead of
// reading the live one. Whenever localStorage was empty or unreadable that
// re-derivation fell through to the OS preference, which is why opening
// Settings snapped the app back to the system theme.
let currentTheme: ThemeMode | null = null;
let chosenThisSession = false;
const listeners = new Set<() => void>();

function readInitialTheme(): ThemeMode {
  const root = document.documentElement;
  // The inline script in the root layout has already resolved this once, and
  // the class it wrote is the theme the user is actually looking at.
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  return getStoredTheme() ?? getPreferredTheme();
}

function getTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  if (currentTheme === null) currentTheme = readInitialTheme();
  return currentTheme;
}

function setThemeGlobal(nextTheme: ThemeMode) {
  currentTheme = nextTheme;
  chosenThisSession = true;
  applyTheme(nextTheme);
  try {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  } catch {
    // See getStoredTheme.
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getTheme);

  useEffect(() => {
    const sync = () => setThemeState(getTheme());
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeGlobal(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeGlobal(getTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, setTheme, toggleTheme };
}

// Whether the user has picked a theme themselves — on this device earlier, or
// during this session. Settings reads it to decide whether the theme saved on
// the profile should seed this device or leave the local choice alone.
export function hasChosenTheme(): boolean {
  return chosenThisSession || getStoredTheme() !== null;
}

export type { ThemeMode };
