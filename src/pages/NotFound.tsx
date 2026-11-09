import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export function StatusPage({ code, title, description }: {
  code: 403 | 404;
  title: string;
  description: string;
}) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-900">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700"><ShieldCheck size={24} /></span>
      <p className="mt-5 text-sm font-bold uppercase tracking-widest text-teal-700">{code}</p>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
        <ArrowLeft size={16} /> Retour à l’accueil
      </Link>
    </section>
  </main>;
}

export default function NotFound() {
  return <StatusPage code={404} title="Page introuvable" description="Cette page n’existe pas ou n’est plus disponible." />;
}
