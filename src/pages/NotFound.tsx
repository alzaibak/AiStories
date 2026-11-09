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
  return <main dir={language === 'ar' ? 'rtl' : 'ltr'} className="grid min-h-screen place-items-center bg-[#fbfaf6] px-4 py-10 text-slate-900">
    <section className="w-full max-w-lg rounded-2xl border border-emerald-950/10 bg-white p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><ShieldCheck size={24} /></span>
      <p className="mt-5 text-sm font-bold uppercase tracking-widest text-teal-700">{code}</p>
      <h1 className="mt-2 text-2xl font-bold">{translateText(title, language)}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{translateText(description, language)}</p>
      <Link to={`/${language}`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
        <ArrowRight size={16} /> {translateText('العودة إلى الرئيسية', language)}
      </Link>
    </section>
  </main>;
}

export default function NotFound() {
  return <StatusPage code={404} title="الصفحة غير موجودة" description="تعذّر العثور على الصفحة المطلوبة." />;
}
