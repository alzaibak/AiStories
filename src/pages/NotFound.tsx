import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';

export function StatusPage({ code, title, description }: {
  code: 403 | 404;
  title: string;
  description: string;
}) {
  const { locale = 'ar' } = useParams();
  const language = locale as SiteLanguage;
  return <main dir={language === 'ar' ? 'rtl' : 'ltr'} className="grid min-h-screen place-items-center bg-paper px-4 py-10 text-ink">
    <section className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand-ink"><ShieldCheck size={24} /></span>
      <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-teal-700">{code}</p>
      <h1 className="mt-2 text-2xl font-semibold">{translateText(title, language)}</h1>
      <p className="mt-3 text-sm leading-6 text-ink-muted">{translateText(description, language)}</p>
      <Link to={`/${language}`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-on hover:bg-brand">
        <ArrowRight size={16} /> {translateText('العودة إلى الرئيسية', language)}
      </Link>
    </section>
  </main>;
}

export default function NotFound() {
  return <StatusPage code={404} title="الصفحة غير موجودة" description="تعذّر العثور على الصفحة المطلوبة." />;
}
