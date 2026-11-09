import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Building2, ClipboardList, FileCheck2, ShieldCheck } from 'lucide-react';
import { useTenderAuth } from '@/contexts/TenderAuthContext';

const featureCards = [
  {
    icon: ClipboardList,
    title: 'Des appels d’offres structurés',
    description: 'DCI, dosage, forme galénique, quantités et exigences documentaires dans un même dossier.'
  },
  {
    icon: BadgeCheck,
    title: 'Des vendeurs vérifiés',
    description: 'Les organisations vendeuses sont contrôlées avant de pouvoir soumettre leurs offres.'
  },
  {
    icon: FileCheck2,
    title: 'Une décision traçable',
    description: 'Comparez les réponses, présélectionnez les fournisseurs et formalisez l’attribution.'
  }
];

export default function LandingPage() {
  const { user } = useTenderAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-white">
              <Building2 size={21} />
            </span>
            <span className="text-lg">Medi<span className="text-teal-700">Tender</span></span>
          </Link>
          <nav className="flex items-center gap-3">
            {user ? (
              <Link to="/workspace" className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
                Accéder à mon espace
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Connexion
                </Link>
                <Link to="/register" className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
                  Créer un compte
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-white to-teal-100 text-slate-900">
          <div className="absolute -right-16 -top-28 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:py-28">
            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/70 px-3 py-1.5 text-sm text-teal-800">
                <ShieldCheck size={16} /> Achats pharmaceutiques B2B
              </div>
              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                Des achats de médicaments plus transparents, de l’appel d’offres à l’attribution.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Une plateforme multi-vendeurs pour publier les besoins, comparer des propositions vérifiées et suivre les décisions d’achat.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to={user ? '/workspace' : '/register'} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">
                  {user ? 'Ouvrir mon espace' : 'Rejoindre la plateforme'} <ArrowRight size={17} />
                </Link>
                {!user && <Link to="/login" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-white">Se connecter</Link>}
              </div>
            </div>
            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Parcours d’achat</p>
                  <h2 className="mt-2 text-xl font-bold">Un cadre commun, trois acteurs</h2>
                </div>
                <BadgeCheck className="text-teal-700" />
              </div>
              {[
                ['01', 'L’acheteur publie', 'Besoin, critères et échéance de réponse.'],
                ['02', 'Les vendeurs répondent', 'Offres comparables et documents de conformité.'],
                ['03', 'L’acheteur attribue', 'Présélection, négociation et bon de commande.']
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-4 border-b border-slate-200 py-5 last:border-0 last:pb-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sm font-semibold text-teal-800">{number}</span>
                  <div>
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Une plateforme B2B spécialisée</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Conçue pour les réalités de l’approvisionnement médical</h2>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={21} /></span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>MediTender — achats pharmaceutiques professionnels</span>
          <span>Accès réservé aux organisations.</span>
        </div>
      </footer>
    </div>
  );
}
