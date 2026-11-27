import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type SiteTheme = 'light' | 'reading' | 'dark';

const STORAGE_KEY = 'site-theme';
const order: SiteTheme[] = ['light', 'reading', 'dark'];
const themeColor: Record<SiteTheme, string> = {
  light: '#FBF8F2',
  reading: '#F1E4C8',
  dark: '#0E1512'
};

function normalizeTheme(value: unknown): SiteTheme | null {
  if (value === 'light' || value === 'reading' || value === 'dark') return value;
  // Older releases stored the sepia mode under this name.
  if (value === 'sepia') return 'reading';
  return null;
}

function systemTheme(): SiteTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* matchMedia can be unavailable */
  }
  return 'light';
}

function readStoredTheme(): SiteTheme | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    /* storage can be unavailable in private mode */
  }
  return null;
}

/** Stored explicit choice, if any. Use this instead of reading the storage key. */
export function readStoredSiteTheme(): SiteTheme | null {
  return readStoredTheme();
}

function applyTheme(theme: SiteTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Kept so older stylesheets and previews keep resolving the same palette.
  root.dataset.siteTheme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = themeColor[theme];
}

interface SiteThemeValue {
  theme: SiteTheme;
  /** True once the visitor picked an explicit theme (otherwise system wins). */
  followsSystem: boolean;
  setTheme: (theme: SiteTheme) => void;
  useSystemTheme: () => void;
  cycleTheme: () => void;
}

const SiteThemeContext = createContext<SiteThemeValue | undefined>(undefined);

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [explicitTheme, setExplicitTheme] = useState<SiteTheme | null>(readStoredTheme);
  const [system, setSystem] = useState<SiteTheme>(systemTheme);
  const theme = explicitTheme ?? system;

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setSystem(systemTheme());
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setExplicitTheme(normalizeTheme(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: SiteTheme) => {
    setExplicitTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* persistence is optional */
    }
  }, []);

  const useSystemTheme = useCallback(() => {
    setExplicitTheme(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const cycleTheme = useCallback(() => {
    setExplicitTheme((current) => {
      const active = current ?? systemTheme();
      const next = order[(order.indexOf(active) + 1) % order.length];
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, followsSystem: explicitTheme === null, setTheme, useSystemTheme, cycleTheme }),
    [theme, explicitTheme, setTheme, useSystemTheme, cycleTheme]
  );
  return <SiteThemeContext.Provider value={value}>{children}</SiteThemeContext.Provider>;
}

export function useSiteTheme() {
  const context = useContext(SiteThemeContext);
  if (!context) {
    return {
      theme: 'light' as SiteTheme,
      followsSystem: true,
      setTheme: () => undefined,
      useSystemTheme: () => undefined,
      cycleTheme: () => undefined
    };
  }
  return context;
}
