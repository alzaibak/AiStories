import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

export type FormFieldError = {
  field: string;
  code: string;
  message: string;
};

export type FormErrorsState = {
  errors: FormFieldError[];
  message: string;
  suggestion: string;
};

const emptyState: FormErrorsState = { errors: [], message: '', suggestion: '' };

export function parseFormErrors(caught: unknown): FormErrorsState {
  if (caught instanceof ApiError) {
    const errors = (caught.errors || []).filter((error) => error?.field);
    if (errors.length) return { errors, message: caught.message, suggestion: caught.suggestion || '' };
    const mapped = Object.entries(caught.fields || {}).map(([field, message]) => ({
      field,
      code: 'invalid',
      message
    }));
    if (mapped.length) return { errors: mapped, message: caught.message, suggestion: caught.suggestion || '' };
    return { ...emptyState, message: caught.message, suggestion: caught.suggestion || '' };
  }
  return { ...emptyState, message: caught instanceof Error ? caught.message : '' };
}

export function fieldLanguage(field: string): SiteLanguage | null {
  if (/(^|\.)en(\.|\[|$)/.test(field)) return 'en';
  if (/(^|\.)fr(\.|\[|$)/.test(field)) return 'fr';
  if (/(^|\.)ar(\.|\[|$)/.test(field) || field === 'title' || field === 'summary') return 'ar';
  return null;
}

export function fieldSelector(field: string) {
  return `[data-field="${field.replace(/"/g, '\\"')}"]`;
}

export function focusField(field: string) {
  if (typeof document === 'undefined') return;
  const direct = document.querySelector<HTMLElement>(fieldSelector(field));
  if (direct) {
    direct.scrollIntoView({ behavior: 'smooth', block: 'center' });
    direct.focus({ preventScroll: true });
    return;
  }
  const lastSegment = field.split('.').pop();
  if (!lastSegment) return;
  const byName = document.querySelector<HTMLElement>(`[name="${lastSegment.replace(/"/g, '\\"')}"]`);
  if (byName) {
    byName.scrollIntoView({ behavior: 'smooth', block: 'center' });
    byName.focus({ preventScroll: true });
  }
}

export function humanFieldLabel(field: string, language: SiteLanguage = 'ar') {
  const normalized = field
    .replace(/^translations\./, '')
    .replace(/^questions\[(\d+)\]/, (_match, index) => `${translateText('السؤال', language)} ${Number(index) + 1}`)
    .replace(/answerOptions\[(\d+)\]/, (_match, index) => `${translateText('الخيار', language)} ${Number(index) + 1}`)
    .replace(/\.(ar|en|fr)(\.|$)/g, (_match, code: SiteLanguage) => ` · ${{ ar: 'العربية', en: 'English', fr: 'Français' }[code]} `)
    .replace(/\./g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  const labels: Record<string, string> = {
    title: 'العنوان',
    summary: 'الملخص',
    description: 'الوصف',
    slug: 'الرابط المختصر',
    storyId: 'القصة',
    partId: 'الجزء',
    passingScore: 'درجة النجاح',
    maxAttempts: 'عدد المحاولات',
    timeLimitSeconds: 'الوقت',
    difficulty: 'الفئة العمرية',
    questions: 'الأسئلة',
    answerOptions: 'الخيارات',
    explanationTranslations: 'التفسير',
    sourceTranslations: 'المصدر',
    collectionId: 'المجموعة',
    sourceBadge: 'نوع المصدر',
    type: 'نوع القصة',
    coverImage: 'صورة الغلاف',
    hook: 'الجملة الجاذبة',
    file: 'الملف'
  };
  const first = field.split(/[.[]/)[0];
  const root = labels[first] ? translateText(labels[first], language) : '';
  if (!root || normalized.includes(root)) return normalized || field;
  return `${root} · ${normalized}`;
}

/**
 * One validation surface for every admin form: highlights the fields, exposes
 * a clickable summary, and knows which language tab holds the first error.
 */
export function useAdminFormErrors() {
  const [state, setState] = useState<FormErrorsState>(emptyState);
  const lastFocused = useRef<string>('');

  const clear = useCallback(() => {
    setState(emptyState);
    lastFocused.current = '';
  }, []);

  const capture = useCallback((caught: unknown, { focus = true } = {}) => {
    const parsed = parseFormErrors(caught);
    setState(parsed);
    const first = parsed.errors[0]?.field;
    if (focus && first && first !== lastFocused.current) {
      lastFocused.current = first;
      window.setTimeout(() => focusField(first), 60);
    }
    return parsed;
  }, []);

  const fieldError = useCallback((field: string) => {
    return state.errors.find((error) => error.field === field)?.message || '';
  }, [state.errors]);

  const errorsFor = useCallback((prefix: string) => state.errors.filter((error) =>
    error.field === prefix || error.field.startsWith(`${prefix}.`) || error.field.startsWith(`${prefix}[`)
  ), [state.errors]);

  const languageCounts = useMemo(() => ({
    ar: state.errors.filter((error) => fieldLanguage(error.field) === 'ar').length,
    en: state.errors.filter((error) => fieldLanguage(error.field) === 'en').length,
    fr: state.errors.filter((error) => fieldLanguage(error.field) === 'fr').length
  }), [state.errors]);

  const hasFieldErrors = state.errors.length > 0;
  return {
    ...state,
    hasFieldErrors,
    languageCounts,
    setErrors: (errors: FormFieldError[], message = '') => setState({ errors, message, suggestion: '' }),
    clear,
    capture,
    fieldError,
    errorsFor
  };
}

export function FormErrorSummary({
  errors,
  message,
  suggestion,
  language = 'ar',
  onSelect
}: {
  errors: FormFieldError[];
  message?: string;
  suggestion?: string;
  language?: SiteLanguage;
  onSelect?: (field: string) => void;
}) {
  if (!errors.length) {
    return message
      ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{message}</p>
      : null;
  }
  return (
    <div role="alert" aria-live="assertive" data-form-error-summary className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
      <p className="font-bold">{translateText('يرجى تصحيح المشاكل التالية:', language)}</p>
      {message && <p className="mt-1 text-sm">{message}</p>}
      <ul className="mt-3 space-y-1.5 text-sm">
        {errors.map((error, index) => (
          <li key={`${error.field}-${error.code}-${index}`}>
            <button
              type="button"
              onClick={() => {
                onSelect?.(error.field);
                focusField(error.field);
              }}
              className="text-start font-semibold underline decoration-red-300 underline-offset-4 hover:text-red-700"
            >
              {humanFieldLabel(error.field, language)} — {error.message}
            </button>
          </li>
        ))}
      </ul>
      {suggestion && (
        <p className="mt-3 rounded-lg bg-white/70 p-2 text-sm">
          {translateText('اقتراح:', language)} <code dir="ltr" className="font-bold">{suggestion}</code>
        </p>
      )}
    </div>
  );
}

export function FieldMessage({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return <span id={id} className="mt-1 block text-xs font-semibold text-red-700">{message}</span>;
}

export function LanguageErrorDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count}`}
      className="ms-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[0.625rem] font-black text-white"
    >
      {count}
    </span>
  );
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
