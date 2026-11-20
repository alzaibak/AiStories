import { BookMarked, Feather, Landmark, ScrollText, type LucideIcon } from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';

export type SourceKind = 'quran_verse' | 'authentic_hadith' | 'historical_source' | 'inspired_story';

const sources: Record<SourceKind, { label: string; Icon: LucideIcon }> = {
  quran_verse: { label: 'من القرآن الكريم', Icon: BookMarked },
  authentic_hadith: { label: 'من السنة النبوية', Icon: ScrollText },
  historical_source: { label: 'مصدر تاريخي', Icon: Landmark },
  inspired_story: { label: 'قصة مستوحاة', Icon: Feather }
};

export function normalizeSource(value: string | null | undefined): SourceKind {
  return value === 'authentic_hadith' || value === 'historical_source' || value === 'inspired_story'
    ? value
    : 'quran_verse';
}

export function sourceLabel(value: string | null | undefined, language: SiteLanguage = 'ar') {
  return translateText(sources[normalizeSource(value)].label, language);
}

/**
 * Never mix revelation, history and inspired storytelling: each class of
 * source has its own icon, colour and label, always visible on story cards.
 */
export function SourceBadge({
  source,
  language = 'ar',
  size = 'sm',
  className = ''
}: {
  source: string | null | undefined;
  language?: SiteLanguage;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const kind = normalizeSource(source);
  const { Icon, label } = sources[kind];
  return (
    <span
      data-source={kind}
      className={`source-badge ${size === 'md' ? 'px-3 py-2 text-xs' : 'px-2.5 py-1.5 text-[0.6875rem]'} ${className}`}
      title={translateText(label, language)}
    >
      <Icon size={size === 'md' ? 14 : 12} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
      <span>{translateText(label, language)}</span>
    </span>
  );
}

/** Compact legend used on policy and story pages to explain the four classes. */
export function SourceLegend({ language = 'ar' }: { language?: SiteLanguage }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {(Object.keys(sources) as SourceKind[]).map((kind) => (
        <li key={kind}>
          <SourceBadge source={kind} language={language} />
        </li>
      ))}
    </ul>
  );
}
