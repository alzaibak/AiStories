import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SiteLanguage } from '@/lib/localization';

export type MysteryBoxState = 'scheduled' | 'active' | 'sold_out';

export type ActiveMysteryBox = {
  slug: string;
  state: MysteryBoxState;
  label: string;
  seasonLabel: string;
  icon: string;
  colorFrom: string;
  colorTo: string;
  accentColor: string;
  animationStyle: 'shimmer' | 'pulse' | 'sparkle' | 'none';
  showCountdownInHeader: boolean;
  bannerImage: string | null;
  startsAt: string;
  endsAt: string;
  serverTime: string;
  remaining: number | null;
  stockTotal?: number | null;
  almostSoldOut: boolean;
  price: {
    amount: string;
    currency: string;
    tier: 'standard' | 'early_bird';
    earlyBirdEndsAt?: string | null;
  };
  itemCount: number;
  perUserLimit: number;
  requiresShipping: boolean;
  needsDigitalConsent?: boolean;
};

type Snapshot = {
  box: ActiveMysteryBox | null;
  loading: boolean;
  error: string | null;
  /** Milliseconds to add to Date.now() to get the server clock. */
  offset: number;
};

const REFRESH_MS = 45_000;
const listeners = new Set<() => void>();
let snapshot: Snapshot = { box: null, loading: true, error: null, offset: 0 };
let inflight: Promise<void> | null = null;
let loadedFor: string | null = null;
let lastLoadAt = 0;

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function load(language: SiteLanguage, force = false) {
  if (inflight && !force) return inflight;
  if (!force && loadedFor === language && Date.now() - lastLoadAt < REFRESH_MS) return Promise.resolve();
  publish({ loading: snapshot.box === null });
  inflight = api
    .get<{ box: ActiveMysteryBox | null; serverTime?: string }>(`/mystery-box/active?lang=${language}`)
    .then((response) => {
      const serverTime = response.serverTime || response.box?.serverTime;
      lastLoadAt = Date.now();
      loadedFor = language;
      publish({
        box: response.box || null,
        loading: false,
        error: null,
        offset: serverTime ? new Date(serverTime).getTime() - Date.now() : 0
      });
    })
    .catch((caught: unknown) => {
      publish({
        loading: false,
        error: caught instanceof Error ? caught.message : 'Mystery box unavailable.'
      });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Server-corrected clock shared by every countdown on the site. */
export function serverNow() {
  return Date.now() + snapshot.offset;
}

/** One request for the whole site: bar, hero card, menu and page share it. */
export function useMysteryBox(language: SiteLanguage) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const notify = () => setVersion((value) => value + 1);
    listeners.add(notify);
    void load(language);
    const timer = window.setInterval(() => { void load(language, true); }, REFRESH_MS);
    // When the countdown reaches zero the server state decides what comes next.
    const edgeWatcher = window.setInterval(() => {
      const current = snapshot.box;
      if (!current) return;
      const edge = current.state === 'scheduled' ? current.startsAt : current.endsAt;
      if (Date.now() + snapshot.offset >= new Date(edge).getTime()) void load(language, true);
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(language, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      listeners.delete(notify);
      window.clearInterval(timer);
      window.clearInterval(edgeWatcher);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [language]);

  return {
    box: snapshot.box,
    loading: snapshot.loading,
    error: snapshot.error,
    /** Server-corrected clock, used by every countdown on the site. */
    now: () => Date.now() + snapshot.offset,
    refresh: () => load(language, true)
  };
}
