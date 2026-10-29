import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem('opensourced_theme') as ThemeMode | null;
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  };

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('opensourced_theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return getSystemTheme();
  });

  const applyTheme = useCallback((targetTheme: 'light' | 'dark') => {
    const root = document.documentElement;
    if (targetTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setResolvedTheme(targetTheme);
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('opensourced_theme', mode);
    if (mode === 'system') {
      applyTheme(getSystemTheme());
    } else {
      applyTheme(mode);
    }
  };

  const toggleTheme = () => {
    // Toggles between light and dark
    const nextTheme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
  };

  useEffect(() => {
    if (themeMode !== 'system') {
      applyTheme(themeMode);
      return;
    }

    // Apply system default
    applyTheme(getSystemTheme());

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode, applyTheme]);

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
  };
}
