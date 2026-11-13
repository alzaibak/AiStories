import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type Language = SiteLanguage;
type Localized = Record<Language, string>;
type QuizOption = { id?: number; text: string; translations: Localized; isCorrect: boolean; sortOrder: number };
type QuizQuestion = {
  id?: number;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  text: string;
  translations: Record<Language, { text: string }>;
  answerOptions: QuizOption[];
  points: number;
  explanationTranslations: Localized;
  sourceTranslations: Localized;
  sortOrder: number;
};
type StoryChoice = { id: number; title: string; slug: string; parts?: Array<{ id: number; partNumber: number; title: string }> };
type QuizRecord = {
  id: number;
  storyId: number;
  partId?: number | null;
  title: string;
  slug: string;
  description?: string;
  translations: Record<Language, { title: string; description: string }>;
  difficulty: 'kids' | 'teens' | 'adults';
  passingScore: number;
  maxAttempts?: number | null;
  timeLimitSeconds?: number | null;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showCorrectAnswersAfterSubmit: boolean;
  accessMode: 'follow_part' | 'free' | 'premium';
  status: 'draft' | 'in_review' | 'published' | 'rejected' | 'archived';
  publishedAt?: string | null;
  story?: { id: number; title: string; slug: string } | null;
  rejectionReason?: string | null;
  authorId?: number | null;
  questions: QuizQuestion[];
};
type QuizStats = { attempts: number; averageScore: number | null; passRate: number | null; hardestQuestions: Array<{ questionId: number; text: string; attempts: number; correctRate: number | null }> };
type QuizListResponse = { items: QuizRecord[]; total: number; page: number; limit: number };

const languages: Language[] = ['ar', 'en', 'fr'];
const languageNames: Record<Language, string> = { ar: 'العربية', en: 'English', fr: 'Français' };
const emptyLocalized = (): Localized => ({ ar: '', en: '', fr: '' });
const emptyQuestion = (sortOrder: number): QuizQuestion => ({
  type: 'single_choice',
  text: '',
  translations: { ar: { text: '' }, en: { text: '' }, fr: { text: '' } },
  answerOptions: [
    { text: '', translations: emptyLocalized(), isCorrect: false, sortOrder: 0 },
    { text: '', translations: emptyLocalized(), isCorrect: false, sortOrder: 1 }
  ],
  points: 1,
  explanationTranslations: emptyLocalized(),
  sourceTranslations: emptyLocalized(),
  sortOrder
});
const statusNames: Record<Language, Record<string, string>> = {
  ar: { draft: 'مسودة', in_review: 'قيد المراجعة', published: 'منشور', rejected: 'مرفوض', archived: 'مؤرشف' },
  en: { draft: 'Draft', in_review: 'In review', published: 'Published', rejected: 'Rejected', archived: 'Archived' },
  fr: { draft: 'Brouillon', in_review: 'En révision', published: 'Publié', rejected: 'Rejeté', archived: 'Archivé' }
};

function text(value: string, language: Language) {
  return translateText(value, language);
}

function useQuizLanguage() {
  const { locale = 'ar' } = useParams();
  return (languages.includes(locale as Language) ? locale : 'ar') as Language;
}

function QuizStatus({ status, language }: { status: QuizRecord['status']; language: Language }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{statusNames[language][status]}</span>;
}

export function AdminQuizzesPage() {
  const language = useQuizLanguage();
  const { locale = 'ar' } = useParams();
  const { user } = useStoryAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StoryChoice[]>([]);
  const [response, setResponse] = useState<QuizListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [storyId, setStoryId] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const isPublisher = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get<StoryChoice[]>('/admin/content/stories').then(setStories).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : text('تعذر تحميل القصص.', language))
    );
  }, [language]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(page), limit: '20' });
    if (search.trim()) query.set('search', search.trim());
    if (status) query.set('status', status);
    if (storyId) query.set('storyId', storyId);
    setError('');
    api.get<QuizListResponse>(`/admin/content/quizzes?${query}`).then((result) => {
      if (active) setResponse(result);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : text('تعذر تحميل الاختبارات.', language));
    });
    return () => { active = false; };
  }, [language, page, refresh, search, status, storyId]);

  async function act(quiz: QuizRecord, action: 'submit-review' | 'duplicate' | 'unpublish' | 'approve' | 'reject' | 'delete') {
    setBusyId(quiz.id);
    setError('');
    try {
      if (action === 'delete') {
        if (!window.confirm(text('هل تريد حذف هذا الاختبار نهائيًا؟', language))) return;
        await api.delete(`/admin/content/quizzes/${quiz.id}`);
      } else if (action === 'duplicate') {
        const duplicate = await api.post<QuizRecord>(`/admin/content/quizzes/${quiz.id}/duplicate`, {});
        navigate(`/${locale}/admin/content/quizzes/${duplicate.id}/edit`);
        return;
      } else if (action === 'approve' || action === 'reject') {
        const comments = action === 'reject' ? window.prompt(text('اكتب سبب الرفض.', language)) : '';
        if (action === 'reject' && !comments?.trim()) return;
        await api.post(`/admin/content/quizzes/${quiz.id}/review`, {
          decision: action === 'approve' ? 'approved' : 'rejected',
          comments: comments || ''
        });
      } else {
        await api.post(`/admin/content/quizzes/${quiz.id}/${action}`, {});
      }
      setRefresh((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text('تعذر تنفيذ الإجراء.', language));
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil((response?.total || 0) / (response?.limit || 20)));
  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-bold text-emerald-700">{text('إدارة المحتوى', language)}</p><h1 className="mt-1 text-3xl font-black text-emerald-950">{text('الاختبارات', language)}</h1></div>
      <Link to={`/${locale}/admin/content/quizzes/new${storyId ? `?storyId=${storyId}` : ''}`} className="rounded-full bg-emerald-900 px-5 py-3 text-sm font-bold text-white">{text('إنشاء اختبار', language)}</Link>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
      <input aria-label={text('بحث', language)} placeholder={text('ابحث بالعنوان أو الرابط', language)} value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} className="rounded-xl border px-3 py-2" />
      <select aria-label={text('الحالة', language)} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="rounded-xl border bg-white px-3 py-2">
        <option value="">{text('كل الحالات', language)}</option>
        {Object.keys(statusNames.ar).map((value) => <option key={value} value={value}>{statusNames[language][value]}</option>)}
      </select>
      <select aria-label={text('القصة', language)} value={storyId} onChange={(event) => { setPage(1); setStoryId(event.target.value); }} className="rounded-xl border bg-white px-3 py-2">
        <option value="">{text('كل القصص', language)}</option>
        {stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
      </select>
      <p className="self-center text-sm text-slate-500">{text('النتائج', language)}: {response?.total ?? '—'}</p>
    </section>
    <section className="space-y-3">
      {(response?.items || []).map((quiz) => <article key={quiz.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="font-bold text-emerald-950">{quiz.translations?.[language]?.title || quiz.title}</h2><QuizStatus status={quiz.status} language={language} /></div><p className="mt-1 text-sm text-slate-500">{quiz.story?.title || stories.find((story) => story.id === quiz.storyId)?.title || ''} · /{quiz.slug}</p>{quiz.rejectionReason && <p className="mt-1 text-sm text-red-700">{quiz.rejectionReason}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/${locale}/admin/content/quizzes/${quiz.id}/edit`} className="rounded-lg border px-3 py-2 text-sm font-bold">{text('تعديل', language)}</Link>
          <button onClick={() => navigate(`/${locale}/admin/content/quizzes/${quiz.id}/edit?preview=1`)} className="rounded-lg border px-3 py-2 text-sm font-bold">{text('معاينة', language)}</button>
          <button onClick={() => void act(quiz, 'duplicate')} disabled={busyId === quiz.id} className="rounded-lg border px-3 py-2 text-sm font-bold">{text('نسخ', language)}</button>
          {['draft', 'rejected', 'archived'].includes(quiz.status) && <button onClick={() => void act(quiz, 'submit-review')} disabled={busyId === quiz.id} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">{text('إرسال للمراجعة', language)}</button>}
          {isPublisher && quiz.status === 'in_review' && <>
            <button onClick={() => void act(quiz, 'approve')} disabled={busyId === quiz.id || quiz.authorId === user?.id} title={quiz.authorId === user?.id ? text('لا يمكنك اعتماد اختبارك الخاص.', language) : ''} className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900">{text('اعتماد ونشر', language)}</button>
            <button onClick={() => void act(quiz, 'reject')} disabled={busyId === quiz.id} className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-900">{text('رفض', language)}</button>
          </>}
          {isPublisher && quiz.status === 'published' && <button onClick={() => void act(quiz, 'unpublish')} disabled={busyId === quiz.id} className="rounded-lg border px-3 py-2 text-sm font-bold">{text('إلغاء النشر', language)}</button>}
          {quiz.status !== 'published' && !quiz.publishedAt && <button onClick={() => void act(quiz, 'delete')} disabled={busyId === quiz.id} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-800">{text('حذف', language)}</button>}
        </div>
      </article>)}
      {response && !response.items.length && <p className="rounded-2xl bg-white p-8 text-center text-slate-500">{text('لا توجد اختبارات مطابقة.', language)}</p>}
    </section>
    <nav aria-label={text('صفحات النتائج', language)} className="flex items-center justify-center gap-4">
      <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">{text('السابق', language)}</button>
      <span className="text-sm">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">{text('التالي', language)}</button>
    </nav>
  </main>;
}

export function AdminQuizEditorPage() {
  const language = useQuizLanguage();
  const { locale = 'ar', quizId } = useParams();
  const { user } = useStoryAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(quizId);
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [stories, setStories] = useState<StoryChoice[]>([]);
  const [title, setTitle] = useState<Localized>(emptyLocalized());
  const [description, setDescription] = useState<Localized>(emptyLocalized());
  const [slug, setSlug] = useState('');
  const [storyId, setStoryId] = useState(searchParams.get('storyId') || '');
  const [partId, setPartId] = useState('');
  const [difficulty, setDifficulty] = useState<QuizRecord['difficulty']>('kids');
  const [passingScore, setPassingScore] = useState('60');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('');
  const [accessMode, setAccessMode] = useState<QuizRecord['accessMode']>('follow_part');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleAnswers, setShuffleAnswers] = useState(true);
  const [showCorrect, setShowCorrect] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion(0)]);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [preview, setPreview] = useState(searchParams.get('preview') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const isPublisher = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const activeStory = useMemo(() => stories.find((story) => String(story.id) === storyId), [stories, storyId]);
  const inputClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5';

  useEffect(() => {
    api.get<StoryChoice[]>('/admin/content/stories').then(setStories).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : text('تعذر تحميل القصص.', language))
    );
  }, [language]);

  useEffect(() => {
    if (!quizId) return;
    let active = true;
    api.get<QuizRecord>(`/admin/content/quizzes/${quizId}`).then((quiz) => {
      if (!active) return;
      setTitle({ ar: quiz.translations?.ar?.title || quiz.title, en: quiz.translations?.en?.title || '', fr: quiz.translations?.fr?.title || '' });
      setDescription({ ar: quiz.translations?.ar?.description || quiz.description || '', en: quiz.translations?.en?.description || '', fr: quiz.translations?.fr?.description || '' });
      setSlug(quiz.slug);
      setStoryId(String(quiz.storyId));
      setPartId(quiz.partId ? String(quiz.partId) : '');
      setDifficulty(quiz.difficulty);
      setPassingScore(String(quiz.passingScore));
      setMaxAttempts(quiz.maxAttempts == null ? '' : String(quiz.maxAttempts));
      setTimeLimitSeconds(quiz.timeLimitSeconds == null ? '' : String(quiz.timeLimitSeconds));
      setAccessMode(quiz.accessMode || 'follow_part');
      setShuffleQuestions(quiz.shuffleQuestions);
      setShuffleAnswers(quiz.shuffleAnswers);
      setShowCorrect(quiz.showCorrectAnswersAfterSubmit);
      setQuestions((quiz.questions || []).map((question, index) => ({
        ...question,
        translations: {
          ar: { text: question.translations?.ar?.text || question.text },
          en: { text: question.translations?.en?.text || '' },
          fr: { text: question.translations?.fr?.text || '' }
        },
        answerOptions: (question.answerOptions || []).map((option, optionIndex) => ({
          ...option,
          translations: { ...emptyLocalized(), ...option.translations, ar: option.translations?.ar || option.text },
          sortOrder: option.sortOrder ?? optionIndex
        })),
        explanationTranslations: { ...emptyLocalized(), ...question.explanationTranslations },
        sourceTranslations: { ...emptyLocalized(), ...question.sourceTranslations },
        sortOrder: question.sortOrder ?? index
      })));
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : text('تعذر تحميل الاختبار.', language));
    });
    api.get<QuizStats>(`/admin/content/quizzes/${quizId}/stats`).then((value) => {
      if (active) setStats(value);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : text('تعذر تحميل الإحصاءات.', language));
    });
    return () => { active = false; };
  }, [quizId, language]);

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  }

  function moveQuestion(from: number, to: number) {
    if (from === to || to < 0 || to >= questions.length) return;
    setQuestions((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((question, index) => ({ ...question, sortOrder: index }));
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const normalizedQuestions = questions.map((question, questionIndex) => ({
        ...question,
        text: question.translations.ar.text,
        sortOrder: questionIndex,
        answerOptions: question.answerOptions.map((option, optionIndex) => ({
          ...option,
          text: option.translations.ar,
          sortOrder: optionIndex
        }))
      }));
      const payload = {
        storyId: Number(storyId),
        partId: partId ? Number(partId) : null,
        title: title.ar,
        slug: slug.trim(),
        description: description.ar,
        translations: Object.fromEntries(languages.map((key) => [key, { title: title[key], description: description[key] }])),
        difficulty,
        passingScore: Number(passingScore),
        maxAttempts: maxAttempts ? Number(maxAttempts) : null,
        timeLimitSeconds: timeLimitSeconds ? Number(timeLimitSeconds) : null,
        accessMode,
        shuffleQuestions,
        shuffleAnswers,
        showCorrectAnswersAfterSubmit: showCorrect,
        questions: normalizedQuestions
      };
      if (isEditing) {
        await api.patch(`/admin/content/quizzes/${quizId}`, payload);
        setNotice(text('تم حفظ الاختبار كمسودة.', language));
      } else {
        const created = await api.post<QuizRecord>('/admin/content/quizzes', payload);
        navigate(`/${locale}/admin/content/quizzes/${created.id}/edit`, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text('تعذر حفظ الاختبار.', language));
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!quizId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/content/quizzes/${quizId}/submit-review`, {});
      setNotice(text('تم إرسال الاختبار للمراجعة.', language));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text('تعذر إرسال الاختبار للمراجعة.', language));
    } finally {
      setBusy(false);
    }
  }

  const fieldLabel = (label: string, values: Localized, setter: (next: Localized) => void, multiline = false) => <label className="block text-sm font-bold text-slate-700">
    {text(label, language)} — {languageNames[activeLanguage]}{activeLanguage === 'ar' ? ' *' : ''}
    {multiline
      ? <textarea required={activeLanguage === 'ar'} dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'} rows={3} value={values[activeLanguage]} onChange={(event) => setter({ ...values, [activeLanguage]: event.target.value })} className={inputClass} />
      : <input required={activeLanguage === 'ar'} dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'} value={values[activeLanguage]} onChange={(event) => setter({ ...values, [activeLanguage]: event.target.value })} className={inputClass} />}
  </label>;

  return <main className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Link to={`/${locale}/admin/content/quizzes`} className="text-sm font-bold text-emerald-800">{text('العودة إلى الاختبارات', language)}</Link><h1 className="mt-2 text-3xl font-black text-emerald-950">{text(isEditing ? 'تعديل الاختبار' : 'إنشاء اختبار', language)}</h1></div>
      {isEditing && <div className="flex gap-2"><button type="button" onClick={() => setPreview((value) => !value)} className="rounded-xl border px-4 py-2 font-bold">{text(preview ? 'إغلاق المعاينة' : 'معاينة', language)}</button><button type="button" onClick={() => void submitForReview()} disabled={busy} className="rounded-xl bg-amber-100 px-4 py-2 font-bold text-amber-950">{text('إرسال للمراجعة', language)}</button></div>}
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    {stats && <section className="grid gap-3 sm:grid-cols-3">
      {[['عدد المحاولات', stats.attempts], ['متوسط الدرجات', stats.averageScore == null ? '—' : `${stats.averageScore}%`], ['معدل النجاح', stats.passRate == null ? '—' : `${stats.passRate}%`]].map(([label, value]) => <div key={label} className="rounded-xl bg-white p-4"><p className="text-sm text-slate-500">{text(String(label), language)}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}
    </section>}
    {stats?.hardestQuestions.length ? <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold text-emerald-950">{text('أصعب الأسئلة', language)}</h2><ol className="mt-3 space-y-2">{stats.hardestQuestions.map((question) => <li key={question.questionId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{question.text}</span><span className="font-bold">{question.correctRate == null ? '—' : `${question.correctRate}%`} · {question.attempts} {text('محاولة', language)}</span></li>)}</ol></section> : null}
    {preview && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold">{title[activeLanguage] || title.ar || text('معاينة الاختبار', language)}</h2>{questions.map((question, index) => <p key={index} className="rounded-lg bg-white p-3">{index + 1}. {question.translations[activeLanguage].text || question.translations.ar.text}</p>)}</section>}
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div role="tablist" aria-label={text('لغة التحرير', language)} className="flex gap-2 border-b pb-3">{languages.map((key) => <button key={key} type="button" role="tab" aria-selected={activeLanguage === key} onClick={() => setActiveLanguage(key)} className={`rounded-lg px-4 py-2 font-bold ${activeLanguage === key ? 'bg-emerald-900 text-white' : 'bg-slate-100'}`}>{languageNames[key]}</button>)}</div>
        <div className="grid gap-4 md:grid-cols-2">{fieldLabel('عنوان الاختبار', title, setTitle)}{fieldLabel('الوصف', description, setDescription, true)}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">{text('الرابط المختصر', language)}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} className={inputClass} dir="ltr" /></label>
          <label className="text-sm font-bold">{text('القصة المرتبطة', language)}<select required value={storyId} onChange={(event) => { setStoryId(event.target.value); setPartId(''); }} className={`${inputClass} bg-white`}><option value="">{text('اختر قصة', language)}</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>
          <label className="text-sm font-bold">{text('الجزء المرتبط (اختياري)', language)}<select value={partId} onChange={(event) => setPartId(event.target.value)} className={`${inputClass} bg-white`}><option value="">{text('نهاية القصة', language)}</option>{activeStory?.parts?.map((part) => <option key={part.id} value={part.id}>{part.partNumber}. {part.title}</option>)}</select></label>
          <label className="text-sm font-bold">{text('الفئة العمرية', language)}<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizRecord['difficulty'])} className={`${inputClass} bg-white`}><option value="kids">{text('الأطفال', language)}</option><option value="teens">{text('اليافعون', language)}</option><option value="adults">{text('البالغون', language)}</option></select></label>
          <label className="text-sm font-bold">{text('درجة النجاح (%)', language)}<input type="number" min="0" max="100" required value={passingScore} onChange={(event) => setPassingScore(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-bold">{text('الحد الأقصى للمحاولات (اختياري)', language)}<input type="number" min="1" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-bold">{text('الوقت بالثواني (اختياري)', language)}<input type="number" min="1" max="7200" value={timeLimitSeconds} onChange={(event) => setTimeLimitSeconds(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-bold">{text('الوصول', language)}<select value={accessMode} onChange={(event) => setAccessMode(event.target.value as QuizRecord['accessMode'])} className={`${inputClass} bg-white`}><option value="follow_part">{text('مثل الجزء المرتبط', language)}</option><option value="free">{text('مجاني', language)}</option><option value="premium">{text('مميز', language)}</option></select></label>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">{([
          { value: shuffleQuestions, setter: setShuffleQuestions, label: 'خلط ترتيب الأسئلة' },
          { value: shuffleAnswers, setter: setShuffleAnswers, label: 'خلط ترتيب الخيارات' },
          { value: showCorrect, setter: setShowCorrect, label: 'عرض الإجابات الصحيحة بعد الإرسال' }
        ] as Array<{ value: boolean; setter: (next: boolean) => void; label: string }>).map(({ value, setter, label }) => <label key={label} className="flex items-center gap-2"><input type="checkbox" checked={value} onChange={(event) => setter(event.target.checked)} />{text(label, language)}</label>)}</div>
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black text-emerald-950">{text('الأسئلة', language)} ({questions.length})</h2><button type="button" onClick={() => setQuestions((current) => [...current, emptyQuestion(current.length)])} className="rounded-xl border border-emerald-900 px-4 py-2 font-bold text-emerald-900">{text('إضافة سؤال', language)}</button></div>
        {questions.map((question, index) => <article key={question.id || `question-${index}`} draggable onDragStart={() => setDragging(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging !== null) moveQuestion(dragging, index); setDragging(null); }} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <header className="flex items-center justify-between"><h3 className="font-extrabold">{text('السؤال', language)} {index + 1} <span className="text-xs font-normal text-slate-500">{text('اسحب لإعادة الترتيب', language)}</span></h3><button type="button" onClick={() => setQuestions((current) => current.filter((_, position) => position !== index).map((item, position) => ({ ...item, sortOrder: position })))} disabled={questions.length === 1} className="text-sm font-bold text-red-700 disabled:opacity-40">{text('حذف السؤال', language)}</button></header>
          <label className="block text-sm font-bold">{text('نوع السؤال', language)}<select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value as QuizQuestion['type'] })} className={`${inputClass} bg-white`}><option value="single_choice">{text('اختيار واحد', language)}</option><option value="multiple_choice">{text('اختيارات متعددة', language)}</option><option value="true_false">{text('صح أو خطأ', language)}</option></select></label>
          {fieldLabel('نص السؤال', Object.fromEntries(languages.map((key) => [key, question.translations[key].text])) as Localized, (next) => updateQuestion(index, { text: next.ar, translations: { ar: { text: next.ar }, en: { text: next.en }, fr: { text: next.fr } } }), true)}
          <div className="space-y-3"><h4 className="font-bold">{text('الخيارات', language)}</h4>{question.answerOptions.map((option, optionIndex) => <div key={option.id || optionIndex} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_auto]">
            <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={`correct-${index}`} aria-label={text('إجابة صحيحة', language)} checked={option.isCorrect} onChange={() => updateQuestion(index, { answerOptions: question.answerOptions.map((item, current) => ({ ...item, isCorrect: current === optionIndex ? !item.isCorrect : question.type === 'multiple_choice' ? item.isCorrect : false })) })} />
            <input required={activeLanguage === 'ar'} aria-label={`${text('نص الخيار', language)} ${optionIndex + 1} — ${languageNames[activeLanguage]}`} dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'} placeholder={`${text('نص الخيار', language)} ${optionIndex + 1} — ${languageNames[activeLanguage]}`} value={option.translations[activeLanguage]} onChange={(event) => updateQuestion(index, { answerOptions: question.answerOptions.map((item, current) => current === optionIndex ? { ...item, text: activeLanguage === 'ar' ? event.target.value : item.text, translations: { ...item.translations, [activeLanguage]: event.target.value } } : item) })} className="rounded-xl border px-3 py-2.5" />
            <button type="button" disabled={question.answerOptions.length <= 2} onClick={() => updateQuestion(index, { answerOptions: question.answerOptions.filter((_, current) => current !== optionIndex).map((item, current) => ({ ...item, sortOrder: current })) })} className="px-2 text-sm font-bold text-red-700 disabled:opacity-40">{text('إزالة', language)}</button>
          </div>)}
            <button type="button" onClick={() => updateQuestion(index, { answerOptions: [...question.answerOptions, { text: '', translations: emptyLocalized(), isCorrect: false, sortOrder: question.answerOptions.length }] })} className="text-sm font-bold text-emerald-800">{text('إضافة خيار', language)}</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {fieldLabel('التفسير', question.explanationTranslations, (next) => updateQuestion(index, { explanationTranslations: next }), true)}
            {fieldLabel('المصدر أو المرجع', question.sourceTranslations, (next) => updateQuestion(index, { sourceTranslations: next }), true)}
          </div>
          <label className="block text-sm font-bold">{text('النقاط', language)}<input type="number" min="1" max="1000" value={question.points} onChange={(event) => updateQuestion(index, { points: Number(event.target.value) })} className={inputClass} /></label>
        </article>)}
      </section>
      <footer className="flex flex-wrap justify-end gap-3"><Link to={`/${locale}/admin/content/quizzes`} className="rounded-full border px-5 py-3 font-bold">{text('إلغاء', language)}</Link><button type="submit" disabled={busy || !storyId} className="rounded-full bg-emerald-900 px-6 py-3 font-bold text-white disabled:opacity-50">{text(busy ? 'جارٍ الحفظ…' : 'حفظ كمسودة', language)}</button></footer>
    </form>
  </main>;
}
