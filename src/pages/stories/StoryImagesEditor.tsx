import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Crop, ImagePlus, Loader2, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { SiteLanguage } from '@/lib/localization';

export type StoryImageValue = {
  coverImage: string;
  heroImage: string;
  socialImage: string;
  coverAlt: { ar: string; en: string; fr: string };
  coverVariants: Array<{ width: number; url: string }>;
  focalPoint: { x: number; y: number };
  imageCredit: string;
};

export const emptyStoryImages: StoryImageValue = {
  coverImage: '',
  heroImage: '',
  socialImage: '',
  coverAlt: { ar: '', en: '', fr: '' },
  coverVariants: [],
  focalPoint: { x: 50, y: 40 },
  imageCredit: ''
};

type UploadResponse = {
  url: string;
  socialImage?: string | null;
  variants?: Array<{ width: number; url: string }>;
  placeholder?: string;
};

const tabs: Array<{ code: SiteLanguage; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
];

const imageCopy: Record<string, { en: string; fr: string }> = {
  'اقتطاع الصورة': { en: 'Crop image', fr: 'Recadrer l’image' },
  'تكبير': { en: 'Zoom', fr: 'Zoom' },
  'استخدم هذا الاقتطاع': { en: 'Use this crop', fr: 'Utiliser ce recadrage' },
  'إلغاء': { en: 'Cancel', fr: 'Annuler' },
  'أكّد أولًا أن الصورة تحترم سياسة التمثيل.': { en: 'First confirm that the image follows the depiction policy.', fr: 'Confirmez d’abord que l’image respecte la politique de représentation.' },
  'الصيغ المقبولة: JPG أو PNG أو WebP.': { en: 'Accepted formats: JPG, PNG or WebP.', fr: 'Formats acceptés : JPG, PNG ou WebP.' },
  'الحجم الأقصى للصورة 5 ميغابايت.': { en: 'Maximum image size is 5 MB.', fr: 'Taille maximale de l’image : 5 Mo.' },
  'تعذر رفع الصورة.': { en: 'Could not upload the image.', fr: 'Impossible de téléverser l’image.' },
  'تم رفع الغلاف وإنشاء النسخ المتجاوبة.': { en: 'Cover uploaded and responsive versions generated.', fr: 'Couverture téléversée et versions responsives générées.' },
  'تم رفع صورة البانر.': { en: 'Banner image uploaded.', fr: 'Image de bannière téléversée.' },
  'صور القصة': { en: 'Story images', fr: 'Images de l’histoire' },
  'غلاف عمودي 3:4 للبطاقات، وبانر عريض 16:9 اختياري لصفحة القصة. تُنشأ نسخ WebP متجاوبة تلقائيًا ويُحذف وصف الصورة الوصفي من الملف.': { en: 'A 3:4 vertical cover for cards and an optional 16:9 wide banner for the story page. Responsive WebP versions are generated automatically and the image description is removed from the file.', fr: 'Une couverture verticale 3:4 pour les cartes et une bannière large 16:9 facultative pour la page de l’histoire. Des versions WebP responsives sont générées automatiquement et la description de l’image est supprimée du fichier.' },
  'دليل الصور المسموحة': { en: 'Allowed image guide', fr: 'Guide des images autorisées' },
  'هذه الصورة تحترم سياسة التمثيل: لا وجه ولا جسد لأي نبي، ويُسمح بالضوء والظل والصورة من الخلف والخط العربي والمناظر والرموز فقط.': { en: 'This image follows the depiction policy: no face or body of any prophet; only light, shadow, rear views, Arabic calligraphy, landscapes and symbols are allowed.', fr: 'Cette image respecte la politique de représentation : aucun visage ni corps de prophète ; seuls la lumière, l’ombre, les vues de dos, la calligraphie arabe, les paysages et les symboles sont autorisés.' },
  'المقاسات الموصى بها: الغلاف 900×1200 (3:4)، البانر 1600×900 (16:9). الصيغ: JPG أو PNG أو WebP، بحد أقصى 5 ميغابايت.': { en: 'Recommended sizes: cover 900×1200 (3:4), banner 1600×900 (16:9). Formats: JPG, PNG or WebP, maximum 5 MB.', fr: 'Tailles recommandées : couverture 900×1200 (3:4), bannière 1600×900 (16:9). Formats : JPG, PNG ou WebP, 5 Mo maximum.' },
  'الغلاف (3:4)': { en: 'Cover (3:4)', fr: 'Couverture (3:4)' },
  'استبدال الغلاف': { en: 'Replace cover', fr: 'Remplacer la couverture' },
  'رفع غلاف': { en: 'Upload cover', fr: 'Téléverser une couverture' },
  'إزالة': { en: 'Remove', fr: 'Supprimer' },
  'حتى 5 م.ب': { en: 'Up to 5 MB', fr: 'Jusqu’à 5 Mo' },
  'البانر العريض (16:9، اختياري)': { en: 'Wide banner (16:9, optional)', fr: 'Bannière large (16:9, facultative)' },
  'يُستخدم الغلاف في الأعلى إن لم يوجد بانر.': { en: 'The cover is used at the top when there is no banner.', fr: 'La couverture est utilisée en haut s’il n’y a pas de bannière.' },
  'استبدال البانر': { en: 'Replace banner', fr: 'Remplacer la bannière' },
  'رفع بانر': { en: 'Upload banner', fr: 'Téléverser une bannière' },
  'نقطة التركيز الأفقية': { en: 'Horizontal focal point', fr: 'Point focal horizontal' },
  'نقطة التركيز العمودية': { en: 'Vertical focal point', fr: 'Point focal vertical' },
  'نص بديل للصورة': { en: 'Image alt text', fr: 'Texte alternatif de l’image' },
  'الوصف البديل': { en: 'Alt description', fr: 'Description alternative' },
  'صف المشهد دون ذكر وجوه أو أشخاص.': { en: 'Describe the scene without faces or people.', fr: 'Décrivez la scène sans visages ni personnes.' },
  'حقوق الصورة (اختياري)': { en: 'Image credit (optional)', fr: 'Crédit de l’image (facultatif)' },
  'اسم المصور أو المصدر': { en: 'Photographer or source name', fr: 'Nom du photographe ou de la source' },
  'معاينة مباشرة': { en: 'Live preview', fr: 'Aperçu en direct' },
  'فاتح': { en: 'Light', fr: 'Clair' },
  'داكن': { en: 'Dark', fr: 'Sombre' },
  'بطاقة المكتبة': { en: 'Library card', fr: 'Carte de bibliothèque' },
  'عنوان القصة': { en: 'Story title', fr: 'Titre de l’histoire' },
  'غلاف تلقائي': { en: 'Automatic cover', fr: 'Couverture automatique' },
  'أعلى صفحة القصة': { en: 'Story page header', fr: 'En-tête de la page de l’histoire' },
  'سيظهر الغلاف أو البانر هنا': { en: 'The cover or banner will appear here.', fr: 'La couverture ou la bannière apparaîtra ici.' },
  'صورة المشاركة (1200×630)': { en: 'Share image (1200×630)', fr: 'Image de partage (1200×630)' },
  'تُنشأ تلقائيًا من الغلاف': { en: 'Generated automatically from the cover.', fr: 'Générée automatiquement à partir de la couverture.' },
  'مسموح': { en: 'Allowed', fr: 'Autorisé' },
  'مناظر طبيعية، صحراء، جبال، ماء، ليل ونجوم.': { en: 'Landscapes, desert, mountains, water, night and stars.', fr: 'Paysages, désert, montagnes, eau, nuit et étoiles.' },
  'خط عربي، زخارف هندسية، أقواس، مصابيح، رموز مجردة.': { en: 'Arabic calligraphy, geometric patterns, arches, lamps, abstract symbols.', fr: 'Calligraphie arabe, motifs géométriques, arches, lampes, symboles abstraits.' },
  'أشخاص من الخلف أو ظلال أو ضوء بعيد دون ملامح.': { en: 'People from behind, shadows, or distant light without features.', fr: 'Personnes de dos, ombres ou lumière lointaine sans traits.' },
  'ممنوع': { en: 'Forbidden', fr: 'Interdit' },
  'أي وجه أو جسد يُنسب إلى نبي أو صحابي.': { en: 'Any face or body attributed to a prophet or companion.', fr: 'Tout visage ou corps attribué à un prophète ou compagnon.' },
  'تصوير مباشر للمشاهد المقدسة أو الشخصيات.': { en: 'Direct depiction of sacred scenes or figures.', fr: 'Représentation directe de scènes ou de figures sacrées.' },
  'تحذير: بدون غلاف ستستخدم المنصة غلافًا تلقائيًا أنيقًا. النشر غير محظور.': { en: 'Warning: without a cover, the platform will use an elegant automatic cover. Publishing is not blocked.', fr: 'Avertissement : sans couverture, la plateforme utilisera une couverture automatique élégante. La publication n’est pas bloquée.' },
  'حفظ القصة': { en: 'Save story', fr: 'Enregistrer l’histoire' },
  'جارٍ الحفظ…': { en: 'Saving…', fr: 'Enregistrement…' }
};

function imageText(value: string, language: SiteLanguage) {
  if (language === 'ar') return value;
  return imageCopy[value]?.[language] || value;
}

export type CropRatio = '3:4' | '3:2' | '16:9' | '1:1';
export type CropRequest = { file: File; role: 'cover' | 'hero'; ratio: CropRatio };

const cropDimensions: Record<CropRatio, { width: number; height: number; label: string }> = {
  '3:4': { width: 900, height: 1200, label: '3:4' },
  '3:2': { width: 1200, height: 800, label: '3:2' },
  '16:9': { width: 1600, height: 900, label: '16:9' },
  '1:1': { width: 1000, height: 1000, label: '1:1' }
};

export function ImageCropper({ request, language, busy, onCancel, onConfirm }: {
  request: CropRequest;
  language: SiteLanguage;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const [ratio, setRatio] = useState<CropRatio>(request.ratio);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensions = cropDimensions[ratio];

  useEffect(() => {
    const url = URL.createObjectURL(request.file);
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = url;
    return () => URL.revokeObjectURL(url);
  }, [request.file]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [ratio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height } = dimensions;
    canvas.width = width;
    canvas.height = height;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const maxX = Math.max(0, (drawWidth - width) / 2);
    const maxY = Math.max(0, (drawHeight - height) / 2);
    const x = (width - drawWidth) / 2 + Math.max(-maxX, Math.min(maxX, offset.x));
    const y = (height - drawHeight) / 2 + Math.max(-maxY, Math.min(maxY, offset.y));
    context.fillStyle = '#0b2a23';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, x, y, drawWidth, drawHeight);
  }, [image, dimensions, zoom, offset]);

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    setOffset({
      x: dragStart.originX + (event.clientX - dragStart.x) * scaleX,
      y: dragStart.originY + (event.clientY - dragStart.y) * scaleY
    });
  }

  async function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    await onConfirm(new File([blob], `story-${ratio.replace(':', 'x')}.jpg`, { type: 'image/jpeg' }));
  }

  return <div className="mt-3 rounded-2xl border border-emerald-900/20 bg-[#0b2a23] p-4 text-[#f4ebdd]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-bold"><Crop size={16} /> {imageText('اقتطاع الصورة', language)}</p>
      <div className="flex gap-1 rounded-full border border-white/20 p-1 text-xs font-bold">
        {(Object.keys(cropDimensions) as CropRatio[]).map((key) => <button key={key} type="button" onClick={() => setRatio(key)} className={`rounded-full px-3 py-1 ${ratio === key ? 'bg-[#f4ebdd] text-[#0b2a23]' : 'text-[#f4ebdd]/70'}`}>{key}</button>)}
      </div>
    </div>
    <div className="mt-3 flex justify-center">
      <canvas
        ref={canvasRef}
        className="max-h-[24rem] w-auto max-w-full cursor-grab touch-none rounded-xl border border-white/15 bg-[#081e19] active:cursor-grabbing"
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragStart({ x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y });
        }}
        onPointerMove={move}
        onPointerUp={() => setDragStart(null)}
        onPointerCancel={() => setDragStart(null)}
      />
    </div>
    <label className="mt-3 flex items-center gap-3 text-xs font-semibold">
      {imageText('تكبير', language)}
      <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => { setZoom(Number(event.target.value)); setOffset({ x: 0, y: 0 }); }} className="flex-1 accent-[#d8c08a]" />
      <span>{Math.round(zoom * 100)}%</span>
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !image} onClick={() => void confirm()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f4ebdd] px-3 py-2 text-xs font-bold text-[#0b2a23] disabled:opacity-60">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {imageText('استخدم هذا الاقتطاع', language)}
      </button>
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold"><X size={14} /> {imageText('إلغاء', language)}</button>
    </div>
  </div>;
}

export function StoryImagesEditor({
  value,
  onChange,
  title,
  language,
  saveFormId,
  saving = false
}: {
  value: StoryImageValue;
  onChange: (next: StoryImageValue) => void;
  title: string;
  language: SiteLanguage;
  saveFormId?: string;
  saving?: boolean;
}) {
  const [activeLanguage, setActiveLanguage] = useState<SiteLanguage>('ar');
  const [depictionConfirmed, setDepictionConfirmed] = useState(Boolean(value.coverImage));
  const [busy, setBusy] = useState<'cover' | 'hero' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const heroInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Existing images were already validated before they were saved.
    if (value.coverImage || value.heroImage) setDepictionConfirmed(true);
  }, [value.coverImage, value.heroImage]);

  function patch(next: Partial<StoryImageValue>) {
    onChange({ ...value, ...next });
  }

  function pickForCrop(file: File | null, role: 'cover' | 'hero') {
    if (!file) return;
    setError('');
    setCropRequest({ file, role, ratio: role === 'hero' ? '16:9' : '3:4' });
  }

  async function upload(file: File | null, role: 'cover' | 'hero') {
    if (!file) return;
    setError('');
    setNotice('');
    if (!depictionConfirmed) {
      setError(imageText('أكّد أولًا أن الصورة تحترم سياسة التمثيل.', language));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(imageText('الصيغ المقبولة: JPG أو PNG أو WebP.', language));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(imageText('الحجم الأقصى للصورة 5 ميغابايت.', language));
      return;
    }
    setBusy(role);
    try {
      const body = await api.uploadFile<UploadResponse>('/admin/content/images', file, { role });
      if (role === 'cover') {
        patch({ coverImage: body.url, coverVariants: body.variants || [], socialImage: body.socialImage || '' });
      } else {
        patch({ heroImage: body.url });
      }
      setNotice(imageText(role === 'cover' ? 'تم رفع الغلاف وإنشاء النسخ المتجاوبة.' : 'تم رفع صورة البانر.', language));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : imageText('تعذر رفع الصورة.', language));
    } finally {
      setBusy(null);
      if (coverInput.current) coverInput.current.value = '';
      if (heroInput.current) heroInput.current.value = '';
    }
  }

  const cover = value.coverImage;
  const objectPosition = `${value.focalPoint.x}% ${value.focalPoint.y}%`;

  return (
    <section id="story-images-editor" className="space-y-5 rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-emerald-950">{imageText('صور القصة', language)}</h2>
          <p className="mt-1 text-sm text-slate-600">{imageText('غلاف عمودي 3:4 للبطاقات، وبانر عريض 16:9 اختياري لصفحة القصة. تُنشأ نسخ WebP متجاوبة تلقائيًا ويُحذف وصف الصورة الوصفي من الملف.', language)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saveFormId && <button type="submit" form={saveFormId} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check size={16} /> {saving ? imageText('جارٍ الحفظ…', language) : imageText('حفظ القصة', language)}</button>}
          <a href="#story-images-guidelines" className="text-sm font-bold text-emerald-800 underline">{imageText('دليل الصور المسموحة', language)}</a>
        </div>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
        <label className="flex items-start gap-3 font-semibold">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={depictionConfirmed}
            onChange={(event) => setDepictionConfirmed(event.target.checked)}
          />
          <span>{imageText('هذه الصورة تحترم سياسة التمثيل: لا وجه ولا جسد لأي نبي، ويُسمح بالضوء والظل والصورة من الخلف والخط العربي والمناظر والرموز فقط.', language)}</span>
        </label>
        <p className="mt-2 text-xs">{imageText('المقاسات الموصى بها: الغلاف 900×1200 (3:4)، البانر 1600×900 (16:9). الصيغ: JPG أو PNG أو WebP، بحد أقصى 5 ميغابايت.', language)}</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold text-emerald-950">{imageText('الغلاف (3:4)', language)}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => coverInput.current?.click()} disabled={!depictionConfirmed || busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {busy === 'cover' ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                {imageText(cover ? 'استبدال الغلاف' : 'رفع غلاف', language)}
              </button>
              {cover && <button type="button" onClick={() => patch({ coverImage: '', coverVariants: [], socialImage: '' })} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700"><Trash2 size={15} /> {imageText('إزالة', language)}</button>}
              <span className="text-xs text-slate-500">{imageText('حتى 5 م.ب', language)}</span>
            </div>
            <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { pickForCrop(event.target.files?.[0] || null, 'cover'); event.currentTarget.value = ''; }} />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold text-emerald-950">{imageText('البانر العريض (16:9، اختياري)', language)}</h3>
            {value.heroImage ? <div className="mt-3 aspect-video overflow-hidden rounded-xl bg-slate-100"><img src={value.heroImage} alt="" className="h-full w-full object-cover" style={{ objectPosition }} /></div> : <p className="mt-2 text-sm text-slate-500">{imageText('يُستخدم الغلاف في الأعلى إن لم يوجد بانر.', language)}</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => heroInput.current?.click()} disabled={!depictionConfirmed || busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-emerald-900 px-4 py-2 text-sm font-bold text-emerald-900 disabled:opacity-50">
                {busy === 'hero' ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                {imageText(value.heroImage ? 'استبدال البانر' : 'رفع بانر', language)}
              </button>
              {value.heroImage && <button type="button" onClick={() => patch({ heroImage: '' })} className="text-sm font-bold text-red-700">{imageText('إزالة', language)}</button>}
            </div>
            <input ref={heroInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { pickForCrop(event.target.files?.[0] || null, 'hero'); event.currentTarget.value = ''; }} />
          </div>

          {cropRequest && <ImageCropper
            request={cropRequest}
            language={language}
            busy={busy !== null}
            onCancel={() => setCropRequest(null)}
            onConfirm={async (file) => { await upload(file, cropRequest.role); setCropRequest(null); }}
          />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              {imageText('نقطة التركيز الأفقية', language)}: {value.focalPoint.x}%
              <input type="range" min="0" max="100" value={value.focalPoint.x} onChange={(event) => patch({ focalPoint: { ...value.focalPoint, x: Number(event.target.value) } })} className="mt-2 w-full accent-emerald-800" />
            </label>
            <label className="text-sm font-semibold">
              {imageText('نقطة التركيز العمودية', language)}: {value.focalPoint.y}%
              <input type="range" min="0" max="100" value={value.focalPoint.y} onChange={(event) => patch({ focalPoint: { ...value.focalPoint, y: Number(event.target.value) } })} className="mt-2 w-full accent-emerald-800" />
            </label>
          </div>

          <div>
            <div role="tablist" aria-label={imageText('نص بديل للصورة', language)} className="flex gap-2 border-b pb-2">
              {tabs.map((tab) => <button key={tab.code} type="button" role="tab" aria-selected={activeLanguage === tab.code} onClick={() => setActiveLanguage(tab.code)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${activeLanguage === tab.code ? 'bg-emerald-900 text-white' : 'bg-slate-100'}`}>{tab.label}</button>)}
            </div>
            <label className="mt-3 block text-sm font-semibold">
              {imageText('الوصف البديل', language)} — {tabs.find((tab) => tab.code === activeLanguage)?.label}
              <input
                value={value.coverAlt[activeLanguage]}
                onChange={(event) => patch({ coverAlt: { ...value.coverAlt, [activeLanguage]: event.target.value } })}
                dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'}
                maxLength={300}
                placeholder={imageText('صف المشهد دون ذكر وجوه أو أشخاص.', language)}
                className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5"
              />
            </label>
          </div>

          <label className="block text-sm font-semibold">
            {imageText('حقوق الصورة (اختياري)', language)}
            <input value={value.imageCredit} onChange={(event) => patch({ imageCredit: event.target.value })} maxLength={300} placeholder={imageText('اسم المصور أو المصدر', language)} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" />
          </label>
        </div>

        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-emerald-950">{imageText('معاينة مباشرة', language)}</h3>
            <div className="flex rounded-full border p-1 text-xs font-bold">
              {(['light', 'dark'] as const).map((theme) => <button key={theme} type="button" onClick={() => setPreviewTheme(theme)} className={`rounded-full px-3 py-1 ${previewTheme === theme ? 'bg-emerald-900 text-white' : 'text-slate-600'}`}>{imageText(theme === 'light' ? 'فاتح' : 'داكن', language)}</button>)}
            </div>
          </div>
          <div className={`space-y-4 rounded-2xl p-4 ${previewTheme === 'dark' ? 'bg-[#0b1713] text-emerald-50' : 'bg-[#f7f5ee] text-emerald-950'}`}>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-70">{imageText('بطاقة المكتبة', language)}</p>
              <div className="w-full max-w-[15rem] overflow-hidden rounded-2xl shadow-lg">
                <div className="relative aspect-[3/4] bg-gradient-to-br from-emerald-900 to-amber-800">
                  {cover ? <img src={cover} alt={value.coverAlt.ar} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition }} /> : <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm font-bold text-white/90">{title || imageText('عنوان القصة', language)}</div>}
                  {!cover && <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-1 text-[0.625rem] font-bold text-white">{imageText('غلاف تلقائي', language)}</span>}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 font-bold">{title || imageText('عنوان القصة', language)}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-70">{imageText('أعلى صفحة القصة', language)}</p>
              <div className="relative aspect-video overflow-hidden rounded-xl bg-emerald-900">
                {value.heroImage || cover ? <img src={value.heroImage || cover} alt="" className="h-full w-full object-cover" style={{ objectPosition }} /> : <div className="grid h-full place-items-center text-sm text-white/80">{imageText('سيظهر الغلاف أو البانر هنا', language)}</div>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-70">{imageText('صورة المشاركة (1200×630)', language)}</p>
              <div className="relative aspect-[1.91/1] overflow-hidden rounded-xl bg-emerald-950">
                {value.socialImage || cover ? <img src={value.socialImage || cover} alt="" className="h-full w-full object-cover" style={{ objectPosition }} /> : <div className="grid h-full place-items-center text-sm text-white/70">{imageText('تُنشأ تلقائيًا من الغلاف', language)}</div>}
              </div>
            </div>
          </div>

          <div id="story-images-guidelines" className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 p-4 text-sm leading-7">
            <p className="flex items-center gap-2 font-bold text-emerald-950"><ShieldCheck size={16} /> {imageText('مسموح', language)}</p>
            <ul className="mt-1 list-inside list-disc text-emerald-900">
              <li>{imageText('مناظر طبيعية، صحراء، جبال، ماء، ليل ونجوم.', language)}</li>
              <li>{imageText('خط عربي، زخارف هندسية، أقواس، مصابيح، رموز مجردة.', language)}</li>
              <li>{imageText('أشخاص من الخلف أو ظلال أو ضوء بعيد دون ملامح.', language)}</li>
            </ul>
            <p className="mt-3 font-bold text-red-800">{imageText('ممنوع', language)}</p>
            <ul className="mt-1 list-inside list-disc text-red-800">
              <li>{imageText('أي وجه أو جسد يُنسب إلى نبي أو صحابي.', language)}</li>
              <li>{imageText('تصوير مباشر للمشاهد المقدسة أو الشخصيات.', language)}</li>
            </ul>
          </div>
        </aside>
      </div>

      {!cover && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{imageText('تحذير: بدون غلاف ستستخدم المنصة غلافًا تلقائيًا أنيقًا. النشر غير محظور.', language)}</p>}
    </section>
  );
}
