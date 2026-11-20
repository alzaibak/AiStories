import { useId } from 'react';
import { CheckCircle2, ChevronDown, Clock3, HelpCircle, Sparkles, XCircle } from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';
import { ProgressBar } from './Progress';

export type QuizDifficulty = 'kids' | 'teens' | 'adults';
export type QuizAnswerId = string | number;

export interface QuizOptionData {
  id: QuizAnswerId;
  text: string;
}

export interface QuizFeedback {
  status: 'correct' | 'wrong';
  correctIds?: QuizAnswerId[];
  explanation?: string;
  source?: string;
}

const difficultyLabels: Record<QuizDifficulty, string> = {
  kids: 'أطفال',
  teens: 'يافعون',
  adults: 'بالغون'
};

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * One question per screen. Large targets, instant feedback, a short
 * explanation and the source. Kids mode enlarges every control.
 */
export function QuizQuestionCard({
  questionText,
  options,
  index,
  total,
  language = 'ar',
  difficulty = 'adults',
  selected = null,
  onSelect,
  feedback = null,
  timeLeftSeconds,
  points,
  disabled = false,
  className = ''
}: {
  questionText: string;
  options: QuizOptionData[];
  index: number;
  total: number;
  language?: SiteLanguage;
  difficulty?: QuizDifficulty;
  selected?: QuizAnswerId | null;
  onSelect?: (id: QuizAnswerId) => void;
  feedback?: QuizFeedback | null;
  timeLeftSeconds?: number | null;
  points?: number;
  disabled?: boolean;
  className?: string;
}) {
  const questionId = `quiz-question-${useId().replace(/[:]/g, '')}`;
  const kids = difficulty === 'kids';
  const answered = Boolean(feedback);
  const progress = total > 0 ? (index / total) * 100 : 0;

  return (
    <section
      className={`ds-card overflow-hidden ${kids ? 'rounded-[2rem]' : ''} ${className}`}
      aria-labelledby={questionId}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-soft/60 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <span dir="ltr" className="grid h-7 min-w-7 place-items-center rounded-full bg-surface px-2 text-brand-ink tabular-nums shadow-soft">
            {index} / {total}
          </span>
          {typeof points === 'number' && (
            <span className="inline-flex items-center gap-1 text-gold-ink">
              <Sparkles size={12} aria-hidden="true" />
              {points} {translateText('نقاط', language)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${kids ? 'bg-gold-soft text-gold-ink' : 'bg-brand-soft text-brand-ink'}`}
          >
            {translateText(difficultyLabels[difficulty], language)}
          </span>
          {typeof timeLeftSeconds === 'number' && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tabular-nums ${
                timeLeftSeconds <= 30 ? 'bg-danger-soft text-danger' : 'bg-surface text-ink-muted'
              }`}
            >
              <Clock3 size={12} aria-hidden="true" />
              {formatClock(timeLeftSeconds)}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 sm:px-6">
        <ProgressBar value={progress} label={translateText('تقدّم الاختبار', language)} />
      </div>

      <div className={`${kids ? 'p-5 sm:p-7' : 'p-5 sm:p-6'}`}>
        <h2
          id={questionId}
          className={`font-bold leading-relaxed text-ink ${kids ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}
        >
          {questionText}
        </h2>

        <div className={`mt-5 grid gap-2.5 ${kids ? 'sm:gap-3' : ''}`} role="group" aria-labelledby={questionId}>
          {options.map((option, optionIndex) => {
            const isSelected = selected === option.id;
            const isCorrect = answered && feedback?.correctIds?.includes(option.id);
            const isWrong = answered && feedback?.status === 'wrong' && isSelected && !isCorrect;
            const stateClass = isCorrect
              ? 'border-success bg-success-soft text-ink'
              : isWrong
                ? 'border-danger bg-danger-soft text-ink'
                : isSelected
                  ? 'border-brand bg-brand-soft text-ink'
                  : 'border-line bg-surface text-ink hover:border-brand/50 hover:bg-surface-soft';
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect?.(option.id)}
                disabled={disabled || answered}
                aria-pressed={isSelected}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition duration-150 disabled:cursor-default ${kids ? 'min-h-[4rem] rounded-3xl p-4' : 'min-h-[3.5rem]'} ${stateClass}`}
              >
                <span
                  className={`grid shrink-0 place-items-center rounded-full border font-bold ${
                    kids ? 'h-10 w-10 text-base' : 'h-8 w-8 text-xs'
                  } ${
                    isCorrect
                      ? 'border-success bg-success text-white'
                      : isWrong
                        ? 'border-danger bg-danger text-white'
                        : isSelected
                          ? 'border-brand bg-brand text-brand-on'
                          : 'border-line-strong text-ink-muted'
                  }`}
                  aria-hidden="true"
                >
                  {isCorrect ? <CheckCircle2 size={kids ? 20 : 16} /> : isWrong ? <XCircle size={kids ? 20 : 16} /> : String.fromCharCode(65 + optionIndex)}
                </span>
                <span className={`flex-1 leading-relaxed ${kids ? 'text-lg font-semibold' : 'text-sm'}`}>
                  {option.text}
                </span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="min-h-[1px]">
          {feedback && (
            <div
              className={`ds-pop mt-4 rounded-2xl border p-4 ${
                feedback.status === 'correct'
                  ? 'border-success/40 bg-success-soft'
                  : 'border-danger/30 bg-danger-soft'
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                {feedback.status === 'correct' ? (
                  <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
                ) : (
                  <XCircle size={18} className="text-danger" aria-hidden="true" />
                )}
                {translateText(
                  feedback.status === 'correct' ? 'إجابة صحيحة، أحسنت!' : 'ليست الإجابة الصحيحة',
                  language
                )}
              </p>
              {(feedback.explanation || feedback.source) && (
                <details className="group mt-2.5 rounded-xl bg-surface/70 px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
                    <HelpCircle size={13} aria-hidden="true" />
                    {translateText('لماذا؟', language)}
                    <ChevronDown size={13} className="transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-2 space-y-2 text-sm leading-7 text-ink-muted">
                    {feedback.explanation && <p>{feedback.explanation}</p>}
                    {feedback.source && (
                      <p className="text-xs">
                        <span className="font-semibold text-ink">{translateText('المصدر', language)}:</span>{' '}
                        {feedback.source}
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
