export type PluralLanguage = 'ar' | 'en' | 'fr';

const arabicForms: Record<Intl.LDMLPluralRule, (count: number) => string> = {
  zero: () => 'لا أجزاء',
  one: () => 'جزء واحد',
  two: () => 'جزءان',
  few: (count) => `${count} أجزاء`,
  many: (count) => `${count} جزءًا`,
  other: (count) => `${count} جزء`
};

const arabicMinutes: Record<Intl.LDMLPluralRule, (count: number) => string> = {
  zero: () => 'أقل من دقيقة',
  one: () => 'دقيقة واحدة',
  two: () => 'دقيقتان',
  few: (count) => `${count} دقائق`,
  many: (count) => `${count} دقيقة`,
  other: (count) => `${count} دقيقة`
};

/** ICU plural rules: Arabic has zero/one/two/few/many/other, English and
 *  French use one/other. Never render "1 أجزاء" or "1 parts" again. */
export function pluralParts(count: number, language: PluralLanguage) {
  const safe = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const rule = new Intl.PluralRules(language === 'ar' ? 'ar' : language).select(safe) as Intl.LDMLPluralRule;
  if (language === 'ar') return arabicForms[rule](safe);
  if (language === 'fr') return `${safe} ${safe === 1 ? 'partie' : 'parties'}`;
  return `${safe} ${safe === 1 ? 'part' : 'parts'}`;
}

export function pluralMinutes(count: number, language: PluralLanguage) {
  const safe = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const rule = new Intl.PluralRules(language === 'ar' ? 'ar' : language).select(safe) as Intl.LDMLPluralRule;
  if (language === 'ar') return arabicMinutes[rule](safe);
  if (language === 'fr') return `${safe} min`;
  return `${safe} min read`;
}

const arabicItems: Record<Intl.LDMLPluralRule, (count: number) => string> = {
  zero: () => 'لا عناصر',
  one: () => 'عنصر واحد',
  two: () => 'عنصران',
  few: (count) => `${count} عناصر`,
  many: (count) => `${count} عنصرًا`,
  other: (count) => `${count} عنصر`
};

export function pluralItems(count: number, language: PluralLanguage) {
  const safe = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const rule = new Intl.PluralRules(language === 'ar' ? 'ar' : language).select(safe) as Intl.LDMLPluralRule;
  if (language === 'ar') return arabicItems[rule](safe);
  if (language === 'fr') return `${safe} ${safe === 1 ? 'élément' : 'éléments'}`;
  return `${safe} ${safe === 1 ? 'item' : 'items'}`;
}

export function pluralReaders(count: number, language: PluralLanguage) {
  const safe = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (language === 'ar') {
    if (safe === 0) return 'لا قراء بعد';
    if (safe === 1) return 'قارئ واحد';
    if (safe === 2) return 'قارئان';
    if (safe <= 10) return `${safe} قراء`;
    return `${safe} قارئًا`;
  }
  if (language === 'fr') return `${safe} ${safe === 1 ? 'lecteur' : 'lecteurs'}`;
  return `${safe} ${safe === 1 ? 'reader' : 'readers'}`;
}
