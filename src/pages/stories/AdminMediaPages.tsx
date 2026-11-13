import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type Language = SiteLanguage;
type AdminStory = { id: number; title: string; slug: string; parts?: Array<{ id: number; partNumber: number; title: string }> };
type AdminVideo = {
  id: number;
  storyId: number;
  partId: number | null;
  mediaAssetId: number | null;
  title: string;
  videoUrl: string | null;
  episodeNumber: number;
  isFree: boolean;
  depictionPolicyConfirmed: boolean;
  status: 'draft' | 'in_review' | 'published' | 'rejected' | 'archived';
  rejectionReason?: string | null;
  translations: Partial<Record<Language, { title?: string; description?: string }>>;
  subtitles?: Partial<Record<Language, string>>;
  story?: { id: number; title: string; slug: string };
};
type MediaAsset = {
  id: number;
  mediaType: string;
  fileName: string;
  mimeType: string | null;
  storyId: number | null;
  partId: number | null;
  bookId: number | null;
  metadata: { altText?: Partial<Record<Language, string>> };
  createdAt: string;
};
type PageResponse<T> = { items: T[]; total: number; page: number; limit: number };
type LanguageText = Record<Language, { title: string; description: string }>;

const languageCodes: Language[] = ['ar', 'en', 'fr'];
const inputClass = 'mt-1 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5';

function useAdminLanguage() {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as Language;
}

function t(text: string, language: Language) {
  return translateText(text, language);
}

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const language = useAdminLanguage();
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8" dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <header>
      <p className="text-sm font-bold text-emerald-700">{t('إدارة المحتوى', language)}</p>
      <h1 className="mt-1 text-3xl font-black text-slate-950">{t(title, language)}</h1>
    </header>
    {children}
  </main>;
}

export function AdminVideosPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const [searchParams] = useSearchParams();
  const storyQuery = searchParams.get('storyId') || '';
  const { user } = useStoryAuth();
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [videoFiles, setVideoFiles] = useState<MediaAsset[]>([]);
  const [storyId, setStoryId] = useState(storyQuery);
  const [episodeNumber, setEpisodeNumber] = useState('1');
  const [videoUrl, setVideoUrl] = useState('');
  const [mediaAssetId, setMediaAssetId] = useState('');
  const [subtitles, setSubtitles] = useState<Record<Language, string>>({ ar: '', en: '', fr: '' });
  const [isFree, setIsFree] = useState(false);
  const [depictionPolicyConfirmed, setDepictionPolicyConfirmed] = useState(false);
  const [translations, setTranslations] = useState<LanguageText>({
    ar: { title: '', description: '' },
    en: { title: '', description: '' },
    fr: { title: '', description: '' }
  });
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [storyResult, videoResult, mediaResult] = await Promise.all([
        api.get<AdminStory[]>('/admin/content/stories?limit=100'),
        api.get<PageResponse<AdminVideo>>(`/admin/content/videos?page=${page}&limit=20${query ? `&q=${encodeURIComponent(query)}` : ''}${storyId ? `&storyId=${storyId}` : ''}`),
        api.get<PageResponse<MediaAsset>>('/admin/content/media?page=1&limit=100&mediaType=video')
      ]);
      setStories(storyResult);
      setVideos(videoResult.items);
      setTotal(videoResult.total);
      setVideoFiles(mediaResult.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل مقاطع الفيديو.', language));
    } finally {
      setLoading(false);
    }
  }, [language, page, query, storyId]);

  useEffect(() => { void load(); }, [load]);

  function selectVideo(video: AdminVideo) {
    setEditingId(video.id);
    setStoryId(String(video.storyId));
    setEpisodeNumber(String(video.episodeNumber));
    setVideoUrl(video.videoUrl || '');
    setMediaAssetId(video.mediaAssetId ? String(video.mediaAssetId) : '');
    setSubtitles({
      ar: video.subtitles?.ar || '',
      en: video.subtitles?.en || '',
      fr: video.subtitles?.fr || ''
    });
    setIsFree(video.isFree);
    setDepictionPolicyConfirmed(video.depictionPolicyConfirmed);
    setTranslations({
      ar: { title: video.translations?.ar?.title || video.title || '', description: video.translations?.ar?.description || '' },
      en: { title: video.translations?.en?.title || '', description: video.translations?.en?.description || '' },
      fr: { title: video.translations?.fr?.title || '', description: video.translations?.fr?.description || '' }
    });
  }

  function reset() {
    setEditingId(null);
    setEpisodeNumber('1');
    setVideoUrl('');
    setMediaAssetId('');
    setSubtitles({ ar: '', en: '', fr: '' });
    setIsFree(false);
    setDepictionPolicyConfirmed(false);
    setTranslations({
      ar: { title: '', description: '' },
      en: { title: '', description: '' },
      fr: { title: '', description: '' }
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!storyId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const payload = {
      episodeNumber: Number(episodeNumber),
      videoUrl: videoUrl.trim() || null,
      mediaAssetId: mediaAssetId ? Number(mediaAssetId) : null,
      title: translations.ar.title,
      description: translations.ar.description,
      translations,
      subtitles: Object.fromEntries(languageCodes.map((code) => [code, subtitles[code].trim() || undefined])),
      isFree,
      depictionPolicyConfirmed
    };
    try {
      if (editingId) {
        await api.patch(`/admin/content/videos/${editingId}`, payload);
      } else {
        await api.post(`/admin/content/stories/${storyId}/videos`, payload);
      }
      setNotice(t(editingId ? 'تم حفظ الفيديو.' : 'تمت إضافة الفيديو كمسودة.', language));
      reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الفيديو.', language));
    } finally {
      setBusy(false);
    }
  }

  async function transition(video: AdminVideo, action: 'submit-review' | 'review', decision?: 'approved' | 'rejected') {
    setBusy(true);
    setError(null);
    try {
      const path = `/admin/content/videos/${video.id}/${action}`;
      if (action === 'review') {
        await api.post(path, { decision, comments: decision === 'rejected' ? window.prompt(t('سبب الرفض', language)) || '' : '' });
      } else {
        await api.post(path, {});
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث حالة الفيديو.', language));
    } finally {
      setBusy(false);
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role)) {
    return <PageShell title="الفيديوهات"><p role="alert">{t('إذن غير متاح.', language)}</p></PageShell>;
  }

  return <PageShell title="الفيديوهات">
    <div className="flex flex-wrap gap-3">
      <Link to={`/${locale}/admin/content/media`} className="rounded-full border border-emerald-900 px-4 py-2 text-sm font-bold text-emerald-900">{t('مكتبة الوسائط', language)}</Link>
      <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={t('بحث بعنوان الفيديو أو القصة', language)} className="min-w-60 flex-1 rounded-xl border border-slate-200 px-4 py-2" />
    </div>
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-extrabold">{t(editingId ? 'تعديل الفيديو' : 'إضافة فيديو', language)}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold">{t('القصة', language)}<select required value={storyId} onChange={(event) => setStoryId(event.target.value)} className={inputClass}><option value="">{t('اختر قصة', language)}</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>
        <label className="text-sm font-semibold">{t('رقم الحلقة', language)}<input type="number" min="1" required value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold">{t('ملف فيديو من مكتبة الوسائط (اختياري)', language)}<select value={mediaAssetId} onChange={(event) => { setMediaAssetId(event.target.value); if (event.target.value) setVideoUrl(''); }} className={inputClass}><option value="">{t('استخدم رابطًا خارجيًا', language)}</option>{videoFiles.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}</select></label>
        {!mediaAssetId && <label className="text-sm font-semibold md:col-span-2">{t('رابط الفيديو (YouTube أو Vimeo)', language)}<input type="url" required value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} dir="ltr" className={inputClass} /></label>}
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {languageCodes.map((code) => <button key={code} type="button" onClick={() => setActiveLanguage(code)} className={`border-b-2 px-3 py-2 text-sm font-bold ${activeLanguage === code ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-500'}`}>{code.toUpperCase()}{code === 'ar' ? ' *' : ''}</button>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">{t('العنوان', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].title} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], title: event.target.value } }))} dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'} className={inputClass} /></label>
        <label className="text-sm font-semibold">{t('الوصف', language)}<textarea value={translations[activeLanguage].description} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], description: event.target.value } }))} rows={2} className={inputClass} /></label>
        <label className="text-sm font-semibold md:col-span-2">{t('رابط ملف الترجمة VTT', language)}<input type="url" value={subtitles[activeLanguage]} onChange={(event) => setSubtitles((current) => ({ ...current, [activeLanguage]: event.target.value }))} dir="ltr" className={inputClass} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isFree} onChange={(event) => setIsFree(event.target.checked)} />{t('فيديو مجاني', language)}</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" required checked={depictionPolicyConfirmed} onChange={(event) => setDepictionPolicyConfirmed(event.target.checked)} />{t('أؤكد الالتزام بسياسة التمثيل والمراجعة', language)}</label>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…', language) : t('حفظ كمسودة', language)}</button>
        {editingId && <button type="button" onClick={reset} className="rounded-full border px-5 py-2.5 font-bold">{t('إلغاء التعديل', language)}</button>}
      </div>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    {loading && <p role="status">{t('جارٍ التحميل…', language)}</p>}
    <div className="space-y-3">
      {videos.map((video) => <article key={video.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold">{video.translations?.[language]?.title || video.title}</h2><p className="mt-1 text-sm text-slate-500">{video.story?.title} · {t('الحلقة', language)} {video.episodeNumber} · {video.status}</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => selectVideo(video)} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{t('تعديل', language)}</button>
            {['draft', 'rejected'].includes(video.status) && <button onClick={() => void transition(video, 'submit-review')} disabled={busy} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-sm font-bold text-white">{t('إرسال للمراجعة', language)}</button>}
            {video.status === 'in_review' && ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && <>
              <button onClick={() => void transition(video, 'review', 'approved')} disabled={busy} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-sm font-bold text-white">{t('اعتماد', language)}</button>
              <button onClick={() => void transition(video, 'review', 'rejected')} disabled={busy} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-bold text-white">{t('رفض', language)}</button>
            </>}
          </div>
        </div>
        {video.rejectionReason && <p className="mt-2 text-sm text-red-700">{video.rejectionReason}</p>}
      </article>)}
    </div>
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{total} · {t('الإجمالي', language)}</span>
      <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('السابق', language)}</button><button disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('التالي', language)}</button></div>
    </div>
  </PageShell>;
}

export function AdminMediaLibraryPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [search, setSearch] = useState('');
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<PageResponse<MediaAsset>>(`/admin/content/media?page=${page}&limit=20${search ? `&q=${encodeURIComponent(search)}` : ''}`);
      setMedia(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل مكتبة الوسائط.', language));
    } finally {
      setLoading(false);
    }
  }, [language, page, search]);

  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const mediaType = file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'ebook' : 'image';
      const request = await api.post<{
        upload: { driver: 'local' | 's3'; url: string; fields: Record<string, string> };
        completeUrl: string;
      }>('/admin/content/media/upload-url', {
        mediaType,
        fileName: file.name,
        mimeType: file.type,
        depictionPolicyConfirmed: true,
        altText: { ar: altText }
      });
      if (request.upload.driver === 'local') {
        await api.uploadFile(request.upload.url, file);
      } else {
        const formData = new FormData();
        Object.entries(request.upload.fields).forEach(([name, value]) => formData.append(name, value));
        formData.append('file', file);
        const response = await fetch(request.upload.url, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(t('فشل تحميل الملف إلى التخزين.', language));
      }
      await api.post(request.completeUrl, {});
      setNotice(t('تم تحميل الملف والتحقق منه.', language));
      setFile(null);
      setAltText('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل الملف.', language));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MediaAsset) {
    if (!window.confirm(t('هل تريد حذف هذا الملف نهائيًا؟', language))) return;
    try {
      await api.delete(`/admin/content/media/${item.id}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حذف الملف.', language));
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role)) {
    return <PageShell title="مكتبة الوسائط"><p role="alert">{t('إذن غير متاح.', language)}</p></PageShell>;
  }

  return <PageShell title="مكتبة الوسائط">
    <form onSubmit={upload} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-3">
      <label className="text-sm font-semibold md:col-span-2">{t('صورة أو فيديو أو ملف PDF', language)}<input type="file" required accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className={inputClass} /></label>
      <label className="text-sm font-semibold">{t('النص البديل بالعربية', language)}<input value={altText} onChange={(event) => setAltText(event.target.value)} className={inputClass} /></label>
      <p className="text-sm text-slate-500 md:col-span-3">{t('حد الحجم الافتراضي 20 ميغابايت؛ يمكن تغييره عبر STORAGE_MAX_UPLOAD_BYTES.', language)}</p>
      <button disabled={busy || !file} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-3">{busy ? t('جارٍ التحميل…', language) : t('تحميل إلى المكتبة', language)}</button>
    </form>
    <div className="flex gap-3"><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={t('بحث باسم الملف', language)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2" /><Link to="../videos" className="rounded-xl border px-4 py-2 font-bold">{t('الفيديوهات', language)}</Link></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    {loading && <p role="status">{t('جارٍ التحميل…', language)}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {media.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="truncate font-bold">{item.fileName}</h2>
        <p className="mt-1 text-xs text-slate-500">{item.mediaType} · {item.mimeType || t('نوع غير محدد', language)}</p>
        <p className="mt-2 text-sm text-slate-600">{item.metadata?.altText?.[language] || item.metadata?.altText?.ar || t('لا يوجد نص بديل.', language)}</p>
        <p className="mt-1 text-xs text-slate-500">{item.storyId ? `${t('قصة', language)} #${item.storyId}` : item.partId ? `${t('جزء', language)} #${item.partId}` : item.bookId ? `${t('كتاب', language)} #${item.bookId}` : t('غير مستخدم', language)}</p>
        <div className="mt-3 flex gap-2"><button onClick={() => void remove(item)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700">{t('حذف', language)}</button></div>
      </article>)}
    </div>
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{total} · {t('الإجمالي', language)}</span>
      <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('السابق', language)}</button><button disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('التالي', language)}</button></div>
    </div>
  </PageShell>;
}
