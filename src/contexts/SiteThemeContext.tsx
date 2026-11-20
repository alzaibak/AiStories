import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type SiteTheme = 'light' | 'sepia' | 'dark';

const STORAGE_KEY = 'site-theme';
const order: SiteTheme[] = ['light', 'sepia', 'dark'];

function isSiteTheme(value: unknown): value is SiteTheme {
  return value === 'light' || value === 'sepia' || value === 'dark';
}

function readStoredTheme(): SiteTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSiteTheme(stored)) return stored;
  } catch {
    /* storage can be unavailable in private mode */
  }
  return 'light';
}

function applyTheme(theme: SiteTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.siteTheme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#0b1a24' : theme === 'sepia' ? '#f2e5cd' : '#fbf7ef';
  }
}

interface SiteThemeValue {
  theme: SiteTheme;
  setTheme: (theme: SiteTheme) => void;
  cycleTheme: () => void;
}

const SiteThemeContext = createContext<SiteThemeValue | undefined>(undefined);

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SiteTheme>(readStoredTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isSiteTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: SiteTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* persistence is optional */
    }
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = order[(order.indexOf(current) + 1) % order.length];
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, cycleTheme }), [theme, setTheme, cycleTheme]);
  return <SiteThemeContext.Provider value={value}>{children}</SiteThemeContext.Provider>;
}

export function useSiteTheme() {
  const context = useContext(SiteThemeContext);
  if (!context) {
    return {
      theme: 'light' as SiteTheme,
      setTheme: () => undefined,
      cycleTheme: () => undefined
    };
  }
  return context;
}
