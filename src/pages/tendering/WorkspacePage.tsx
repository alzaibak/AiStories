import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Activity, BadgeCheck, Bell, ClipboardList, FileCheck2, HelpCircle, LoaderCircle, LogOut, MessageSquareText, PackagePlus, Plus, RefreshCw, Search, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { useTenderAuth } from '@/contexts/TenderAuthContext';
import {
  api,
  type ClarificationRecord,
  type DocumentRecord,
  type MessageRecord,
  type NotificationRecord,
  type OfferRecord,
  type Organization,
  type ProductRecord,
  type PurchaseOrderRecord,
  type TenderItem,
  type TenderRecord,
  type TenderUser
} from '@/lib/tenderApi';

type WorkspaceTab = 'dashboard' | 'tenders' | 'offers' | 'catalog' | 'orders' | 'organizations' | 'documents';
type Overview = {
  users: number;
  organizations: number;
  pendingOrganizations: number;
  tenders: number;
  activeTenders: number;
  offers: number;
  purchaseOrders: number;
};
type Participant = Pick<TenderUser, 'id' | 'firstName' | 'lastName' | 'role'>;
type DocumentFormState = { offerId: string; type: string; file: File | null; expiresAt: string };
type OverviewCard = { label: string; value: number; icon: LucideIcon };

const tabLabels: Record<WorkspaceTab, string> = {
  dashboard: 'Tableau de bord',
  tenders: 'Appels d’offres',
  offers: 'Mes offres',
  catalog: 'Catalogue',
  orders: 'Bons de commande',
  organizations: 'Organisations',
  documents: 'Documents'
};

function money(value: number | string, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(value) || 0);
}

function date(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(parsed);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Brouillon', PUBLISHED: 'Publié', CLOSED: 'Clôturé',
    IN_NEGOTIATION: 'En négociation', AWARDED: 'Attribué', CANCELLED: 'Annulé',
    SUBMITTED: 'Soumise', SHORTLISTED: 'Présélectionnée', REJECTED: 'Refusée',
    WON: 'Retenue', WITHDRAWN: 'Retirée', PENDING: 'En attente',
    APPROVED: 'Approuvée', SUSPENDED: 'Suspendue', REJECTED_DOC: 'Refusé',
    ISSUED: 'Émis', ACKNOWLEDGED: 'Accepté', FULFILLED: 'Exécuté'
  };
  return labels[status] || status;
}

function Badge({ status }: { status: string }) {
  const positive = ['APPROVED', 'WON', 'PUBLISHED', 'FULFILLED', 'ACKNOWLEDGED'].includes(status);
  const warning = ['PENDING', 'DRAFT', 'IN_NEGOTIATION', 'SHORTLISTED', 'ISSUED'].includes(status);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? 'bg-emerald-50 text-emerald-800' : warning ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabel(status)}</span>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700">{label}<input {...props} className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none placeholder:text-slate-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-100 ${props.className || ''}`} /></label>;
}

function WorkspacePage() {
  const { user, isLoading, logout, refreshUser } = useTenderAuth();
  const [tab, setTab] = useState<WorkspaceTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tenders, setTenders] = useState<TenderRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [questionTender, setQuestionTender] = useState<TenderRecord | null>(null);
  const [questions, setQuestions] = useState<ClarificationRecord[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [activeOffer, setActiveOffer] = useState<OfferRecord | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messageText, setMessageText] = useState('');
  const [documentForm, setDocumentForm] = useState<DocumentFormState>({
    offerId: '', type: 'COA', file: null, expiresAt: ''
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        const [stats, orgs, docs, allTenders, allOffers, allOrders] = await Promise.all([
          api.get<Overview>('/admin/overview'),
          api.get<Organization[]>('/auth/organizations'),
          api.get<DocumentRecord[]>('/documents'),
          api.get<TenderRecord[]>('/tenders'),
          api.get<OfferRecord[]>('/offers'),
          api.get<PurchaseOrderRecord[]>('/purchase-orders')
        ]);
        setOverview(stats);
        setOrganizations(orgs);
        setDocuments(docs);
        setTenders(allTenders);
        setOffers(allOffers);
        setOrders(allOrders);
      } else {
        const [tenderData, offerData, orderData] = await Promise.all([
          api.get<TenderRecord[]>('/tenders'),
          api.get<OfferRecord[]>('/offers'),
          api.get<PurchaseOrderRecord[]>('/purchase-orders')
        ]);
        setTenders(tenderData);
        setOffers(offerData);
        setOrders(orderData);
        if (user.role === 'SELLER') {
          const [productData, documentData] = await Promise.all([
            api.get<ProductRecord[]>('/catalog/products'),
            api.get<DocumentRecord[]>('/documents')
          ]);
          setProducts(productData);
          setDocuments(documentData);
        }
      }
      setNotifications(await api.get<NotificationRecord[]>('/notifications'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (user) setTab(user.role === 'SELLER' ? 'dashboard' : 'tenders');
  }, [user]);

  const availableTabs = useMemo<WorkspaceTab[]>(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') return ['organizations', 'tenders', 'offers', 'documents', 'orders'];
    if (user?.role === 'SELLER') return ['dashboard', 'tenders', 'offers', 'catalog', 'documents', 'orders'];
    return ['tenders', 'offers', 'orders'];
  }, [user?.role]);
  const normalizedSearch = searchText.trim().toLocaleLowerCase('fr');
  const filteredTenders = normalizedSearch
    ? tenders.filter((tender) => [
      tender.reference,
      tender.title,
      tender.buyerOrganization?.legalName,
      ...tender.items.map((item) => item.genericName)
    ].some((value) => value?.toLocaleLowerCase('fr').includes(normalizedSearch)))
    : tenders;
  const filteredOffers = normalizedSearch
    ? offers.filter((offer) => [
      String(offer.id),
      offer.sellerOrganization?.legalName
    ].some((value) => value?.toLocaleLowerCase('fr').includes(normalizedSearch)))
    : offers;

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’opération a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const openQuestions = async (tender: TenderRecord) => {
    setError('');
    setQuestionTender(tender);
    try {
      setQuestions(await api.get<ClarificationRecord[]>(`/collaboration/tenders/${tender.id}/clarifications`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les questions.');
    }
  };

  const sendQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!questionTender || !questionText.trim()) return;
    await runAction(async () => {
      await api.post(`/collaboration/tenders/${questionTender.id}/clarifications`, { question: questionText });
      setQuestionText('');
      setQuestions(await api.get<ClarificationRecord[]>(`/collaboration/tenders/${questionTender.id}/clarifications`));
    }, 'Question publiée aux participants.');
  };

  const answerQuestion = async (questionId: number) => {
    const answer = answerDrafts[questionId]?.trim();
    if (!answer) return;
    await runAction(async () => {
      await api.post(`/collaboration/clarifications/${questionId}/answer`, { answer });
      if (questionTender) setQuestions(await api.get<ClarificationRecord[]>(`/collaboration/tenders/${questionTender.id}/clarifications`));
    }, 'Réponse publiée.');
  };

  const openConversation = async (offer: OfferRecord) => {
    setError('');
    setActiveOffer(offer);
    try {
      const [nextMessages, nextParticipants] = await Promise.all([
        api.get<MessageRecord[]>(`/collaboration/offers/${offer.id}/messages`),
        api.get<Participant[]>(`/collaboration/offers/${offer.id}/participants`)
      ]);
      setMessages(nextMessages);
      setParticipants(nextParticipants);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger la conversation.');
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOffer || !participants.length || !messageText.trim()) return;
    await runAction(async () => {
      await api.post(`/collaboration/offers/${activeOffer.id}/messages`, {
        recipientUserId: participants[0].id,
        body: messageText
      });
      setMessageText('');
      setMessages(await api.get<MessageRecord[]>(`/collaboration/offers/${activeOffer.id}/messages`));
    }, 'Message envoyé.');
  };

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50"><LoaderCircle className="animate-spin text-teal-700" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'BUYER' && !user.organizationId) {
    return <BuyerOnboarding onComplete={refreshUser} onLogout={logout} />;
  }

  const organization = user.organization;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const title = isAdmin ? 'Administration' : user.role === 'BUYER' ? 'Espace acheteur' : 'Espace vendeur';

  return (
    <div dir={user.language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="flex w-full flex-col bg-[var(--palette-forest)] p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:p-6">
        <Link to="/" className="mb-4 flex items-center gap-2 px-1 font-bold tracking-tight lg:mb-10" aria-label="Accueil MediTender">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700"><ShieldCheck size={19} /></span>
          <span className="text-base">MediTender</span>
        </Link>
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto lg:flex-col">
          {availableTabs.map((item) => (
            <button key={item} onClick={() => { setTab(item); setError(''); setNotice(''); }} className={`whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${tab === item ? 'bg-teal-700 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
              {tabLabels[item]}
            </button>
          ))}
          {user.role === 'SUPER_ADMIN' && <Link to="/admin/invitations" className="whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">Invitations administrateur</Link>}
        </nav>
        <div className="mt-auto hidden border-t border-white/15 pt-5 lg:block">
          <button type="button" className="flex items-center gap-2 px-3 py-2 text-sm text-white/75 hover:text-white"><HelpCircle size={16} /> Aide</button>
          <button onClick={() => { logout(); void refreshUser(); }} className="mt-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/75 hover:text-white"><LogOut size={16} /> Déconnexion</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div><h1 className="text-xl font-bold tracking-tight">{tabLabels[tab]}</h1><p className="text-xs text-slate-500">{organization?.legalName || title}</p></div>
          <div className="flex items-center gap-3">
            <label className="hidden items-center gap-2 rounded-full border border-slate-200 px-3 py-2 md:flex">
              <Search size={15} className="text-slate-500" />
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-label="Rechercher dans l’espace" placeholder="Rechercher..." className="w-32 bg-transparent text-xs outline-none placeholder:text-slate-500" />
            </label>
            <div className="hidden text-right sm:block"><p className="text-sm font-medium">{user.firstName} {user.lastName}</p><p className="text-xs text-slate-500">{organization?.legalName || user.email}</p></div>
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{`${user.firstName[0] || ''}${user.lastName[0] || ''}`.toUpperCase()}</span>
            <div className="relative">
              <button aria-label="Notifications" onClick={() => setNotificationsOpen((open) => !open)} className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"><Bell size={17} />{notifications.some((notification) => !notification.isRead) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}</button>
              {notificationsOpen && <div className="absolute right-0 top-11 z-20 w-[min(90vw,22rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-3 py-2 text-sm font-semibold">Notifications</p>
                {notifications.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Aucune notification.</p>}
                {notifications.slice(0, 10).map((notification) => <button key={notification.id} onClick={() => {
                  if (!notification.isRead) void runAction(async () => {
                    await api.patch(`/notifications/${notification.id}/read`, {});
                    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
                  });
                  if (notification.link) window.location.assign(notification.link);
                  setNotificationsOpen(false);
                }} className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 ${notification.isRead ? 'opacity-60' : ''}`}><span className="block text-sm font-medium">{notification.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{notification.message}</span></button>)}
              </div>}
            </div>
            <button onClick={() => { logout(); void refreshUser(); }} aria-label="Déconnexion" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><p className="mt-1 text-sm text-slate-600">{title} · Vue d’ensemble de la plateforme</p></div>
          <button onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
        </div>
        {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {user.role === 'SELLER' && organization?.verificationStatus !== 'APPROVED' && (
          <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Activity className="mt-0.5 shrink-0" size={18} />
            <p><strong>Compte en attente de validation.</strong> Votre organisation doit être approuvée par l’administration avant de soumettre une offre ou de gérer son catalogue. Vous pouvez toutefois consulter les appels d’offres publics.</p>
          </div>
        )}
        {user.role === 'BUYER' && organization?.verificationStatus !== 'APPROVED' && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Organisation en cours de vérification.</strong> La publication de nouveaux appels d’offres sera disponible après validation par l’administration.
          </div>
        )}
        {loading && <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" /> Chargement des données…</div>}

        {isAdmin && overview && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { label: 'Organisations', value: overview.organizations, icon: Users },
              { label: 'À vérifier', value: overview.pendingOrganizations, icon: BadgeCheck },
              { label: 'Appels actifs', value: overview.activeTenders, icon: ClipboardList },
              { label: 'Offres reçues', value: overview.offers, icon: FileCheck2 }
            ] satisfies OverviewCard[]).map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={17} className="text-teal-700" /></div>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'dashboard' && user.role === 'SELLER' && (
          <SellerDashboard tenders={filteredTenders} offers={filteredOffers} documents={documents} organization={organization?.legalName || ''} />
        )}
        {tab === 'tenders' && user.role === 'BUYER' && (
          <BuyerTenders tenders={filteredTenders} offers={filteredOffers} approved={organization?.verificationStatus === 'APPROVED'} busy={busy} onAction={runAction} onQuestions={openQuestions} onConversation={openConversation} />
        )}
        {tab === 'tenders' && user.role === 'SELLER' && (
          <SellerTenders tenders={filteredTenders} offers={filteredOffers} products={products} approved={organization?.verificationStatus === 'APPROVED'} busy={busy} onAction={runAction} onQuestions={openQuestions} />
        )}
        {tab === 'tenders' && isAdmin && (
          <TenderTable tenders={filteredTenders} onQuestions={openQuestions} />
        )}
        {tab === 'offers' && (
          <OffersTable offers={filteredOffers} user={user} busy={busy} onAction={runAction} onConversation={openConversation} />
        )}
        {tab === 'catalog' && user.role === 'SELLER' && (
          <Catalog products={products} approved={organization?.verificationStatus === 'APPROVED'} busy={busy} onAction={runAction} />
        )}
        {tab === 'orders' && <PurchaseOrders orders={orders} user={user} busy={busy} onAction={runAction} />}
        {tab === 'organizations' && isAdmin && (
          <Organizations organizations={organizations} busy={busy} onAction={runAction} />
        )}
        {tab === 'documents' && (
          <Documents
            documents={documents}
            isAdmin={isAdmin}
            isSeller={user.role === 'SELLER'}
            approved={organization?.verificationStatus === 'APPROVED'}
            form={documentForm}
            setForm={setDocumentForm}
            busy={busy}
            onAction={runAction}
          />
        )}
      </main>

      {questionTender && (
        <Modal title={`Clarifications — ${questionTender.reference}`} onClose={() => setQuestionTender(null)}>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {questions.length === 0 && <p className="text-sm text-slate-500">Aucune question publiée pour le moment.</p>}
            {questions.map((question) => (
              <article key={question.id} className="rounded-lg border border-slate-200 p-4">
                <p className="font-medium">{question.question}</p>
                {question.answer ? <p className="mt-2 border-l-2 border-teal-600 pl-3 text-sm text-slate-600">{question.answer}</p> :
                  user.role === 'BUYER' && <div className="mt-3 flex gap-2">
                    <input aria-label="Réponse à la question" value={answerDrafts[question.id] || ''} onChange={(event) => setAnswerDrafts((previous) => ({ ...previous, [question.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Réponse visible par les participants" />
                    <button onClick={() => void answerQuestion(question.id)} disabled={busy} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Répondre</button>
                  </div>}
              </article>
            ))}
          </div>
          {['BUYER', 'SELLER'].includes(user.role) && ['PUBLISHED', 'IN_NEGOTIATION'].includes(questionTender.status) && (
            <form onSubmit={sendQuestion} className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
              <input required maxLength={5000} value={questionText} onChange={(event) => setQuestionText(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Poser une question publique" />
              <button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Publier</button>
            </form>
          )}
        </Modal>
      )}

      {activeOffer && (
        <Modal title={`Négociation — offre #${activeOffer.id}`} onClose={() => setActiveOffer(null)}>
          <div className="max-h-[45vh] space-y-3 overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-slate-500">Aucun message dans cette négociation privée.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${message.senderUserId === user.id ? 'ml-auto bg-teal-50 text-teal-950' : 'bg-slate-100 text-slate-800'}`}>
                <p>{message.body}</p><p className="mt-1 text-xs opacity-60">{date(message.createdAt)}</p>
              </div>
            ))}
          </div>
          {participants.length > 0 && <form onSubmit={sendMessage} className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
            <input required maxLength={5000} value={messageText} onChange={(event) => setMessageText(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder={`Message privé à ${participants[0].firstName} ${participants[0].lastName}`} />
            <button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Envoyer</button>
          </form>}
        </Modal>
      )}
      </div>
    </div>
  );
}

function SellerDashboard({ tenders, offers, documents, organization }: {
  tenders: TenderRecord[];
  offers: OfferRecord[];
  documents: DocumentRecord[];
  organization: string;
}) {
  const now = new Date();
  const openTenders = tenders.filter((tender) => tender.status === 'PUBLISHED' && new Date(tender.deadline) > now);
  const sentOffers = offers.filter((offer) => !['DRAFT', 'WITHDRAWN'].includes(offer.status));
  const negotiationCount = offers.filter((offer) => ['SUBMITTED', 'SHORTLISTED'].includes(offer.status) &&
    tenders.some((tender) => tender.id === offer.tenderId && tender.status === 'IN_NEGOTIATION')).length;
  const wonOffers = offers.filter((offer) => offer.status === 'WON').length;
  const successRate = sentOffers.length ? Math.round((wonOffers / sentOffers.length) * 100) : 0;
  const upcoming = [...openTenders].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).slice(0, 3);
  const expiringDocuments = documents
    .filter((document) => document.expiresAt && new Date(document.expiresAt) >= now &&
      new Date(document.expiresAt).getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())
    .slice(0, 3);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1);
    const count = sentOffers.filter((offer) => offer.submittedAt &&
      new Date(offer.submittedAt).getFullYear() === month.getFullYear() &&
      new Date(offer.submittedAt).getMonth() === month.getMonth()).length;
    return { label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(month), count };
  });
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const points = buckets.map((bucket, index) => {
    const x = 8 + index * 16;
    const y = 82 - (bucket.count / maxCount) * 68;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const offerStatuses = [
    { label: 'Envoyées', count: offers.filter((offer) => offer.status === 'SUBMITTED').length, color: 'var(--palette-primary)' },
    { label: 'Négociation', count: negotiationCount, color: 'var(--palette-forest)' },
    { label: 'Retenues', count: wonOffers, color: 'var(--palette-mint)' },
    { label: 'Autres', count: offers.filter((offer) => ['REJECTED', 'WITHDRAWN', 'DRAFT'].includes(offer.status)).length, color: 'var(--palette-alert)' }
  ];
  const statusTotal = Math.max(1, offerStatuses.reduce((total, item) => total + item.count, 0));
  let gradientStart = 0;
  const statusGradient = offerStatuses.map((item) => {
    const start = gradientStart;
    gradientStart += item.count / statusTotal * 100;
    return `${item.color} ${start}% ${gradientStart}%`;
  }).join(', ');

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: 'Appels d’offres ouverts', value: openTenders.length },
        { label: 'Offres envoyées', value: sentOffers.length },
        { label: 'En négociation', value: negotiationCount },
        { label: 'Offres gagnées', value: wonOffers, featured: true }
      ].map((metric) => <article key={metric.label} className={`rounded-xl border p-4 ${metric.featured ? 'border-transparent bg-teal-700 text-white' : 'border-slate-200 bg-white'}`}>
        <p className={`text-sm ${metric.featured ? 'text-white/80' : 'text-slate-500'}`}>{metric.label}</p>
        <div className="mt-2 flex items-end justify-between"><span className="text-3xl font-bold">{metric.value}</span>{metric.featured && <span className="text-sm">Taux de succès {successRate} %</span>}</div>
      </article>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Activité des offres</h2>
        <div className="mt-4">
          <svg viewBox="0 0 112 92" role="img" aria-label="Graphique des offres envoyées sur sept mois" className="h-40 w-full overflow-visible">
            {[14, 36, 58, 80].map((y) => <line key={y} x1="8" x2="104" y1={y} y2={y} stroke="var(--palette-line)" strokeWidth="0.6" />)}
            <path d={`${points} L 104 88 L 8 88 Z`} fill="var(--palette-mint)" opacity="0.28" />
            <path d={points} fill="none" stroke="var(--palette-primary)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">{buckets.map((bucket, index) => <span key={`${bucket.label}-${index}`}>{bucket.label}</span>)}</div>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Statut des offres</h2>
        <div className="mt-5 flex items-center gap-4">
          <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${statusGradient})` }}>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-bold text-slate-800">{offers.length}</div>
          </div>
          <ul className="space-y-2 text-xs">{offerStatuses.map((item) => <li key={item.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}<span className="font-semibold">{item.count}</span></li>)}</ul>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Échéances proches</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {upcoming.length === 0 && <li className="py-3 text-sm text-slate-500">Aucune échéance prochaine.</li>}
          {upcoming.map((tender) => {
            const days = Math.max(0, Math.ceil((new Date(tender.deadline).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
            return <li key={tender.id} className="flex items-center justify-between gap-2 py-3">
              <div className="min-w-0"><p className="truncate text-xs font-bold">{tender.reference}</p><p className="truncate text-xs text-slate-500">{tender.items[0]?.genericName || tender.title}</p></div>
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">{days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `${days} jours`}</span>
            </li>;
          })}
        </ul>
      </section>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Documents bientôt expirés</h2><p className="text-xs text-slate-500">{organization}</p></div><span className="text-xs text-slate-500">30 prochains jours</span></div>
      {expiringDocuments.length === 0 ? <p className="py-3 text-sm text-slate-500">Aucun document n’expire dans les 30 prochains jours.</p> :
        <div className="grid gap-2 md:grid-cols-3">{expiringDocuments.map((document) => <div key={document.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="truncate">{document.fileName}</span><span className="shrink-0 text-slate-500">{date(document.expiresAt)}</span></div>)}</div>}
    </section>
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="my-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} aria-label="Fermer" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button></div>
      {children}
    </section>
  </div>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

function Empty({ text }: { text: string }) {
  return <Panel><p className="py-6 text-center text-sm text-slate-500">{text}</p></Panel>;
}

function BuyerOnboarding({ onComplete, onLogout }: { onComplete: () => Promise<void>; onLogout: () => void }) {
  const [form, setForm] = useState({ legalName: '', country: '', address: '', registrationNumber: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch('/auth/onboarding', form);
      await onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de créer l’organisation.');
    } finally {
      setBusy(false);
    }
  };
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
    <Panel className="w-full max-w-xl p-7">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Compléter le profil acheteur</h1><p className="mt-2 text-sm leading-6 text-slate-600">Associez votre ancien compte à une organisation acheteuse. L’administration vérifiera ses informations avant la publication d’appels d’offres.</p></div><button onClick={onLogout} className="text-sm font-medium text-slate-500">Déconnexion</button></div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Raison sociale" required value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
        <Field label="Pays" required value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
        <Field label="Adresse professionnelle" required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
        <Field label="Numéro d’enregistrement" required value={form.registrationNumber} onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))} />
        <button disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer l’organisation'}</button>
      </form>
    </Panel>
  </main>;
}

function BuyerTenders({ tenders, offers, approved, busy, onAction, onQuestions, onConversation }: {
  tenders: TenderRecord[];
  offers: OfferRecord[];
  approved: boolean;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
  onQuestions: (tender: TenderRecord) => Promise<void>;
  onConversation: (offer: OfferRecord) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', deliveryCountry: '', deliveryRegion: '',
    deadline: '', type: 'NORMAL' as 'NORMAL' | 'URGENT',
    visibility: 'PUBLIC' as 'PUBLIC' | 'INVITATION_ONLY', sealedOffers: true
  });
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>([]);
  const [items, setItems] = useState([{
    genericName: '', dosage: '', dosageForm: '', packaging: '', quantity: '', unit: 'boîtes'
  }]);
  const [compareTender, setCompareTender] = useState<TenderRecord | null>(null);
  const [inviteTender, setInviteTender] = useState<TenderRecord | null>(null);
  const [invitationCandidates, setInvitationCandidates] = useState<Organization[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<number[]>([]);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const updateItem = (index: number, field: keyof (typeof items)[number], value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAction(async () => {
      const tender = await api.post<TenderRecord>('/tenders', {
        title: form.title,
        description: form.description,
        deliveryCountry: form.deliveryCountry,
        deliveryRegion: form.deliveryRegion || null,
        deadline: new Date(form.deadline).toISOString(),
        type: form.type,
        visibility: form.visibility,
        sealedOffers: form.sealedOffers,
        requiredDocuments,
        items: items.map((item) => ({
          ...item,
          packaging: item.packaging || null,
          quantity: Number(item.quantity)
        }))
      });
      await api.post(`/tenders/${tender.id}/publish`, {});
      if (form.visibility === 'INVITATION_ONLY') {
        setInviteTender(tender);
        setInvitationCandidates(await api.get<Organization[]>(`/tenders/${tender.id}/invitation-candidates`));
      }
      setCreating(false);
      setForm({ title: '', description: '', deliveryCountry: '', deliveryRegion: '', deadline: '', type: 'NORMAL', visibility: 'PUBLIC', sealedOffers: true });
      setRequiredDocuments([]);
      setItems([{ genericName: '', dosage: '', dosageForm: '', packaging: '', quantity: '', unit: 'boîtes' }]);
    }, 'L’appel d’offres a été publié.');
  };
  return <div className="space-y-5">
    <div className="flex justify-end"><button disabled={!approved} onClick={() => setCreating((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Nouvel appel d’offres</button></div>
    {creating && <Panel><div className="mb-4"><h2 className="font-semibold">Publier un besoin pharmaceutique</h2><p className="mt-1 text-sm text-slate-500">Le formulaire crée un brouillon puis le publie après validation.</p></div>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Titre de l’appel" required value={form.title} onChange={(event) => update('title', event.target.value)} />
        <Field label="Pays de livraison" required value={form.deliveryCountry} onChange={(event) => update('deliveryCountry', event.target.value)} />
        <Field label="Région" value={form.deliveryRegion} onChange={(event) => update('deliveryRegion', event.target.value)} />
        <Field label="Date limite de réponse" type="datetime-local" required min={new Date().toISOString().slice(0, 16)} value={form.deadline} onChange={(event) => update('deadline', event.target.value)} />
        <label className="text-sm font-medium text-slate-700">Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as 'NORMAL' | 'URGENT' }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></label>
        <label className="text-sm font-medium text-slate-700">Visibilité<select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as 'PUBLIC' | 'INVITATION_ONLY' }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="PUBLIC">Publique</option><option value="INVITATION_ONLY">Sur invitation uniquement</option></select></label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 md:col-span-2"><input type="checkbox" checked={form.sealedOffers} onChange={(event) => setForm((current) => ({ ...current, sealedOffers: event.target.checked }))} className="mt-1" /><span><strong className="block">Offres scellées</strong><span className="text-slate-500">Seul l’acheteur propriétaire pourra consulter les offres après la date limite.</span></span></label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2">Description<textarea required maxLength={10000} rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-teal-700 focus:outline-none" /></label>
        <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium">Documents obligatoires</legend><div className="flex flex-wrap gap-3">{['COA', 'GMP', 'ORIGIN_CERTIFICATE', 'RCP', 'AMM', 'QUOTATION'].map((type) => <label key={type} className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={requiredDocuments.includes(type)} onChange={(event) => setRequiredDocuments((current) => event.target.checked ? [...current, type] : current.filter((item) => item !== type))} />{type.replace(/_/g, ' ')}</label>)}</div></fieldset>
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Médicaments demandés</h3><button type="button" onClick={() => setItems((current) => [...current, { genericName: '', dosage: '', dosageForm: '', packaging: '', quantity: '', unit: 'boîtes' }])} className="text-sm font-semibold text-teal-800">+ Ajouter une ligne</button></div>
          {items.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-slate-500">Médicament {index + 1}</span>{items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-red-700">Retirer</button>}</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="DCI / substance active" required value={item.genericName} onChange={(event) => updateItem(index, 'genericName', event.target.value)} />
              <Field label="Dosage" required value={item.dosage} onChange={(event) => updateItem(index, 'dosage', event.target.value)} />
              <Field label="Forme galénique" required value={item.dosageForm} onChange={(event) => updateItem(index, 'dosageForm', event.target.value)} />
              <Field label="Conditionnement" value={item.packaging} onChange={(event) => updateItem(index, 'packaging', event.target.value)} />
              <Field label="Quantité" required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} />
              <Field label="Unité" required value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} />
            </div>
          </div>)}
        </div>
        <div className="flex gap-2 md:col-span-2"><button disabled={busy || !approved} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Publier</button><button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium">Annuler</button></div>
      </form>
    </Panel>}
    {tenders.length === 0 ? <Empty text="Aucun appel d’offres pour le moment. Créez le premier appel d’offres." /> :
      <div className="grid gap-4 lg:grid-cols-2">{tenders.map((tender) => <Panel key={tender.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{tender.reference}</p><h2 className="mt-1 text-lg font-semibold">{tender.title}</h2></div><Badge status={tender.status} /></div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{tender.description}</p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><span><strong>Livraison :</strong> {tender.deliveryCountry}</span><span><strong>Réponse avant :</strong> {date(tender.deadline)}</span></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">{offers.filter((offer) => offer.tenderId === tender.id && ['SUBMITTED', 'SHORTLISTED', 'WON'].includes(offer.status)).length} offre(s) reçue(s)</span>
          <div className="flex gap-2">
            <button onClick={() => void onQuestions(tender)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Questions</button>
            <button onClick={() => setCompareTender(tender)} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Comparer</button>
            {tender.visibility === 'INVITATION_ONLY' && <button onClick={() => void onAction(async () => {
              setInviteTender(tender);
              setSelectedSellerIds([]);
              setInvitationCandidates(await api.get<Organization[]>(`/tenders/${tender.id}/invitation-candidates`));
            })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Inviter des vendeurs</button>}
          </div>
        </div>
        {compareTender?.id === tender.id && <div className="mt-4 border-t border-slate-100 pt-4"><OfferComparison offers={offers.filter((offer) => offer.tenderId === tender.id)} busy={busy} onAction={onAction} onConversation={onConversation} /></div>}
      </Panel>)}</div>}
    {inviteTender && <Modal title={`Inviter des vendeurs — ${inviteTender.reference}`} onClose={() => setInviteTender(null)}>
      <p className="mb-4 text-sm text-slate-600">Seules les organisations vendeuses approuvées peuvent être invitées.</p>
      {invitationCandidates.length === 0 ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Aucun vendeur vérifié n’est actuellement disponible.</p> : <div className="max-h-72 space-y-2 overflow-y-auto">{invitationCandidates.map((seller) => <label key={seller.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={selectedSellerIds.includes(seller.id)} onChange={(event) => setSelectedSellerIds((current) => event.target.checked ? [...current, seller.id] : current.filter((id) => id !== seller.id))} /><span><strong className="block text-sm">{seller.legalName}</strong><span className="text-xs text-slate-500">{seller.country} · {seller.registrationNumber}</span></span></label>)}</div>}
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setInviteTender(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Fermer</button><button disabled={busy || !selectedSellerIds.length} onClick={() => void onAction(async () => {
        await api.post(`/tenders/${inviteTender.id}/invitations`, { sellerOrgIds: selectedSellerIds });
        setInviteTender(null);
      }, 'Invitations envoyées.')} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Envoyer les invitations</button></div>
    </Modal>}
  </div>;
}

function OfferComparison({ offers, busy, onAction, onConversation }: {
  offers: OfferRecord[];
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
  onConversation: (offer: OfferRecord) => Promise<void> | void;
}) {
  if (!offers.length) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aucune offre n’a encore été soumise.</p>;
  return <div className="space-y-3">{[...offers].sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount)).map((offer) => <article key={offer.id} className="rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{offer.sellerOrganization?.legalName || `Vendeur #${offer.sellerOrgId}`}</h3><p className="mt-1 text-sm text-slate-500">{offer.sellerOrganization?.country} · {offer.deliveryDays} j · {offer.incoterm} · Validité {offer.validityDays} j</p></div><div className="text-right"><p className="text-lg font-semibold">{money(offer.totalAmount, offer.currency)}</p><Badge status={offer.status} /></div></div>
    <div className="mt-3 space-y-1 text-sm">{offer.items.map((item) => <p key={item.id} className="flex justify-between gap-3 text-slate-600"><span>{item.tenderItem?.genericName || 'Ligne'} · {item.tenderItem?.dosage}</span><span>{money(item.unitPrice, offer.currency)} / unité</span></p>)}</div>
    {offer.comment && <p className="mt-3 text-sm italic text-slate-500">{offer.comment}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {['SUBMITTED', 'SHORTLISTED'].includes(offer.status) && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/offers/${offer.id}/status`, { status: 'SHORTLISTED' }).then(() => undefined), 'Offre présélectionnée.')} className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800">Présélectionner</button>}
      {['SUBMITTED', 'SHORTLISTED'].includes(offer.status) && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/offers/${offer.id}/status`, { status: 'WON' }).then(() => undefined), 'Offre attribuée. Un bon de commande a été généré.')} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Attribuer et générer le bon</button>}
      {['SUBMITTED', 'SHORTLISTED', 'WON'].includes(offer.status) && <button onClick={() => void onConversation(offer)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"><MessageSquareText size={15} /> Négocier</button>}
    </div>
  </article>)}</div>;
}

function SellerTenders({ tenders, offers, products, approved, busy, onAction, onQuestions }: {
  tenders: TenderRecord[];
  offers: OfferRecord[];
  products: ProductRecord[];
  approved: boolean;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
  onQuestions: (tender: TenderRecord) => Promise<void>;
}) {
  const [selected, setSelected] = useState<TenderRecord | null>(null);
  const [form, setForm] = useState({ deliveryDays: '14', validityDays: '30', currency: 'EUR', incoterm: 'DAP', paymentTerms: 'Virement bancaire, 30 jours', comment: '' });
  const [prices, setPrices] = useState<Record<number, { unitPrice: string; moq: string; availableQuantity: string; productId: string }>>({});
  const prepareOffer = (tender: TenderRecord) => {
    setSelected(tender);
    setPrices(Object.fromEntries(tender.items.map((item) => [item.id, {
      unitPrice: '',
      moq: '1',
      availableQuantity: String(item.quantity),
      productId: ''
    }])));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    await onAction(async () => {
      await api.post('/offers', {
        tenderId: selected.id,
        ...form,
        deliveryDays: Number(form.deliveryDays),
        validityDays: Number(form.validityDays),
        submitNow: selected.requiredDocuments.length === 0,
        items: selected.items.map((item) => ({
          tenderItemId: item.id,
          unitPrice: Number(prices[item.id]?.unitPrice),
          moq: Number(prices[item.id]?.moq),
          availableQuantity: Number(prices[item.id]?.availableQuantity),
          ...(prices[item.id]?.productId ? { productId: Number(prices[item.id].productId) } : {})
        }))
      });
      setSelected(null);
    }, selected.requiredDocuments.length === 0
      ? 'Votre offre a été soumise.'
      : 'Brouillon créé. Ajoutez les documents demandés et faites-les vérifier avant la soumission.');
  };
  const offeredTenderIds = new Set(offers.map((offer) => offer.tenderId));
  const openTenders = tenders.filter((tender) => tender.status === 'PUBLISHED');
  return <div className="space-y-5">
    {openTenders.length === 0 ? <Empty text="Aucun appel d’offres ouvert ne correspond à votre accès." /> :
      <div className="grid gap-4 lg:grid-cols-2">{openTenders.map((tender) => <Panel key={tender.id}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{tender.reference}</p><h2 className="mt-1 text-lg font-semibold">{tender.title}</h2></div><Badge status={tender.type} /></div>
        <p className="mt-2 text-sm text-slate-600">{tender.buyerOrganization?.legalName} · Livraison : {tender.deliveryCountry}</p>
        <p className="mt-1 text-sm text-slate-500">Réponse avant le {date(tender.deadline)} · {tender.items.length} ligne(s)</p>
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">{tender.items.map((item) => <li key={item.id} className="text-sm"><strong>{item.genericName}</strong> · {item.dosage}, {item.dosageForm} · {item.quantity} {item.unit}</li>)}</ul>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => void onQuestions(tender)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Clarifications</button>
          {offeredTenderIds.has(tender.id) ? <span className="self-center text-sm font-medium text-emerald-700">Offre déjà enregistrée</span> :
            <button disabled={!approved || busy} onClick={() => prepareOffer(tender)} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Répondre</button>}
        </div>
      </Panel>)}</div>}
    {selected && <Modal title={`Répondre à ${selected.reference}`} onClose={() => setSelected(null)}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">Proposez un prix unitaire, un MOQ et une quantité disponible pour chaque ligne.</p>
        {selected.items.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 font-medium">{item.genericName} · {item.dosage}, {item.dosageForm} — {item.quantity} {item.unit} demandés</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Prix unitaire (${form.currency})`} required type="number" min="0.0001" step="0.0001" value={prices[item.id]?.unitPrice || ''} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: { ...current[item.id], unitPrice: event.target.value } }))} />
            <Field label="MOQ" required type="number" min="0.001" step="0.001" value={prices[item.id]?.moq || '1'} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: { ...current[item.id], moq: event.target.value } }))} />
            <Field label="Disponible" required type="number" min="0.001" step="0.001" value={prices[item.id]?.availableQuantity || ''} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: { ...current[item.id], availableQuantity: event.target.value } }))} />
          </div>
          <label className="mt-3 block text-sm font-medium">Référence du catalogue (facultatif)<select value={prices[item.id]?.productId || ''} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: { ...current[item.id], productId: event.target.value } }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Aucune référence sélectionnée</option>{products.filter((product) => product.genericName.toLowerCase() === item.genericName.toLowerCase()).map((product) => <option key={product.id} value={product.id}>{product.tradeName} · {product.dosage} · {product.packaging}</option>)}</select></label>
        </div>)}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Délai (jours)" type="number" min="1" required value={form.deliveryDays} onChange={(event) => setForm((current) => ({ ...current, deliveryDays: event.target.value }))} />
          <Field label="Validité (jours)" type="number" min="1" required value={form.validityDays} onChange={(event) => setForm((current) => ({ ...current, validityDays: event.target.value }))} />
          <label className="text-sm font-medium">Incoterm<select value={form.incoterm} onChange={(event) => setForm((current) => ({ ...current, incoterm: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <Field label="Conditions de paiement" required maxLength={255} value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} />
        </div>
        <label className="block space-y-1.5 text-sm font-medium">Commentaire<textarea maxLength={5000} rows={2} value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <button disabled={busy || !approved} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Soumettre l’offre</button>
      </form>
    </Modal>}
  </div>;
}

function TenderTable({ tenders, onQuestions }: { tenders: TenderRecord[]; onQuestions: (tender: TenderRecord) => Promise<void> }) {
  if (!tenders.length) return <Empty text="Aucun appel d’offres dans la plateforme." />;
  return <Panel className="overflow-x-auto p-0"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Titre</th><th className="px-4 py-3">Acheteur</th><th className="px-4 py-3">Échéance</th><th className="px-4 py-3">Statut</th><th /></tr></thead><tbody>{tenders.map((tender) => <tr key={tender.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{tender.reference}</td><td className="px-4 py-3">{tender.title}</td><td className="px-4 py-3">{tender.buyerOrganization?.legalName}</td><td className="px-4 py-3">{date(tender.deadline)}</td><td className="px-4 py-3"><Badge status={tender.status} /></td><td className="px-4 py-3"><button onClick={() => void onQuestions(tender)} className="text-teal-800">Questions</button></td></tr>)}</tbody></table></Panel>;
}

function OffersTable({ offers, user, busy, onAction, onConversation }: {
  offers: OfferRecord[];
  user: TenderUser;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
  onConversation: (offer: OfferRecord) => Promise<void>;
}) {
  if (!offers.length) return <Empty text="Aucune offre disponible." />;
  return <Panel className="overflow-x-auto p-0"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Appel</th><th className="px-4 py-3">Vendeur</th><th className="px-4 py-3">Montant</th><th className="px-4 py-3">Livraison</th><th className="px-4 py-3">Statut</th><th /></tr></thead><tbody>{offers.map((offer) => <tr key={offer.id} className="border-t border-slate-100"><td className="px-4 py-3">#{offer.tenderId}</td><td className="px-4 py-3">{offer.sellerOrganization?.legalName || `Mon organisation · #${offer.sellerOrgId}`}</td><td className="px-4 py-3 font-medium">{money(offer.totalAmount, offer.currency)}</td><td className="px-4 py-3">{offer.deliveryDays} jours</td><td className="px-4 py-3"><Badge status={offer.status} /></td><td className="px-4 py-3">
    {user.role === 'SELLER' && offer.status === 'DRAFT' && <button disabled={busy} onClick={() => void onAction(() => api.post(`/offers/${offer.id}/submit`, {}).then(() => undefined), 'Offre soumise.')} className="mr-3 font-semibold text-teal-800 disabled:opacity-50">Soumettre</button>}
    {['SUBMITTED', 'SHORTLISTED', 'WON'].includes(offer.status) && <button onClick={() => void onConversation(offer)} className="inline-flex items-center gap-1 text-teal-800"><MessageSquareText size={15} /> Négocier</button>}
  </td></tr>)}</tbody></table>
    {user.role === 'SELLER' && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Les offres visibles sont celles de votre organisation. Les propositions concurrentes restent confidentielles.</p>}
  </Panel>;
}

function Catalog({ products, approved, busy, onAction }: {
  products: ProductRecord[];
  approved: boolean;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    tradeName: '', genericName: '', dosage: '', dosageForm: '', packaging: '',
    manufacturer: '', originCountry: '',
    marketingAuthorization: 'PENDING', rcpUrl: '', rcpLanguage: 'fr' as 'fr' | 'en' | 'ar',
    rcpUpdatedAt: ''
  });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAction(async () => {
      await api.post('/catalog/products', {
        ...form,
        rcpUpdatedAt: form.rcpUpdatedAt || null
      });
      setForm({
        tradeName: '', genericName: '', dosage: '', dosageForm: '', packaging: '',
        manufacturer: '', originCountry: '',
        marketingAuthorization: 'PENDING', rcpUrl: '', rcpLanguage: 'fr', rcpUpdatedAt: ''
      });
    }, 'Médicament ajouté au catalogue.');
  };
  return <div className="space-y-5">
    <Panel><div className="mb-4 flex items-center gap-2"><PackagePlus size={19} className="text-teal-700" /><h2 className="font-semibold">Ajouter une référence pharmaceutique</h2></div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nom commercial" required value={form.tradeName} onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))} />
        <Field label="DCI / substance active" required value={form.genericName} onChange={(event) => setForm((current) => ({ ...current, genericName: event.target.value }))} />
        <Field label="Dosage" required value={form.dosage} onChange={(event) => setForm((current) => ({ ...current, dosage: event.target.value }))} />
        <Field label="Forme galénique" required value={form.dosageForm} onChange={(event) => setForm((current) => ({ ...current, dosageForm: event.target.value }))} />
        <Field label="Conditionnement" value={form.packaging} onChange={(event) => setForm((current) => ({ ...current, packaging: event.target.value }))} />
        <Field label="Fabricant" value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} />
        <Field label="Pays d’origine" required value={form.originCountry} onChange={(event) => setForm((current) => ({ ...current, originCountry: event.target.value }))} />
        <label className="text-sm font-medium">Statut AMM<select value={form.marketingAuthorization} onChange={(event) => setForm((current) => ({ ...current, marketingAuthorization: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="PENDING">En attente</option><option value="APPROVED">Approuvée</option><option value="NOT_REQUIRED">Non requise</option><option value="REJECTED">Refusée</option></select></label>
        <Field label="Lien RCP" type="url" value={form.rcpUrl} onChange={(event) => setForm((current) => ({ ...current, rcpUrl: event.target.value }))} />
        <label className="text-sm font-medium">Langue du RCP<select value={form.rcpLanguage} onChange={(event) => setForm((current) => ({ ...current, rcpLanguage: event.target.value as 'fr' | 'en' | 'ar' }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select></label>
        <Field label="Mise à jour du RCP" type="date" value={form.rcpUpdatedAt} onChange={(event) => setForm((current) => ({ ...current, rcpUpdatedAt: event.target.value }))} />
        <div className="flex items-end"><button disabled={!approved || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> Ajouter au catalogue</button></div>
      </form>
    </Panel>
    {products.length === 0 ? <Empty text="Votre catalogue est vide." /> : <Panel className="overflow-x-auto p-0"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Médicament</th><th className="px-4 py-3">Dosage et forme</th><th className="px-4 py-3">Conditionnement</th><th className="px-4 py-3">Fabricant</th><th className="px-4 py-3">Origine</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-t border-slate-100"><td className="px-4 py-3"><strong>{product.tradeName}</strong><span className="block text-xs text-slate-500">{product.genericName}</span></td><td className="px-4 py-3">{product.dosage} · {product.dosageForm}</td><td className="px-4 py-3">{product.packaging || '—'}</td><td className="px-4 py-3">{product.manufacturer || '—'}</td><td className="px-4 py-3">{product.originCountry}</td></tr>)}</tbody></table></Panel>}
  </div>;
}

function Organizations({ organizations, busy, onAction }: {
  organizations: Organization[];
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
}) {
  const pending = organizations.filter((organization) => organization.verificationStatus === 'PENDING');
  if (!organizations.length) return <Empty text="Aucune organisation enregistrée." />;
  return <div className="space-y-4">{organizations.map((organization) => <Panel key={organization.id} className="flex flex-wrap items-center justify-between gap-4">
    <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{organization.legalName}</h2><Badge status={organization.verificationStatus} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{organization.type === 'BUYER' ? 'Acheteur' : 'Vendeur'}</span></div><p className="mt-1 text-sm text-slate-500">{organization.country} · {organization.registrationNumber} {organization.pharmaceuticalLicense && `· Licence ${organization.pharmaceuticalLicense}`}</p>{organization.internalAdminNote && <p className="mt-2 text-xs text-slate-500">Note : {organization.internalAdminNote}</p>}</div>
    <div className="flex gap-2">
      {pending.includes(organization) && <><button disabled={busy} onClick={() => void onAction(() => api.patch(`/auth/organizations/${organization.id}/verification`, { verificationStatus: 'APPROVED' }).then(() => undefined), 'Organisation approuvée.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Approuver</button><button disabled={busy} onClick={() => void onAction(() => api.patch(`/auth/organizations/${organization.id}/verification`, { verificationStatus: 'REJECTED' }).then(() => undefined), 'Organisation refusée.')} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Refuser</button></>}
      {organization.verificationStatus === 'APPROVED' && organization.type === 'SELLER' && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/auth/organizations/${organization.id}/verification`, { verificationStatus: 'SUSPENDED' }).then(() => undefined), 'Vendeur suspendu.')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Suspendre</button>}
    </div>
  </Panel>)}</div>;
}

function Documents({ documents, isAdmin, isSeller, approved, form, setForm, busy, onAction }: {
  documents: DocumentRecord[];
  isAdmin: boolean;
  isSeller: boolean;
  approved: boolean;
  form: DocumentFormState;
  setForm: (next: (current: DocumentFormState) => DocumentFormState) => void;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAction(async () => {
      if (!form.file) throw new Error('Sélectionnez un fichier PDF ou ZIP.');
      const mimeType = form.file.type ||
        (form.file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/zip');
      const { document, upload } = await api.post<{
        document: DocumentRecord;
        upload: { url: string; fields: Record<string, string> };
      }>('/documents/upload-url', {
        type: form.type,
        offerId: form.offerId ? Number(form.offerId) : undefined,
        fileName: form.file.name,
        fileSize: form.file.size,
        mimeType,
        expiresAt: form.expiresAt || null
      });
      const uploadForm = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) uploadForm.append(name, value);
      uploadForm.append('file', form.file);
      try {
        const uploadResponse = await fetch(upload.url, { method: 'POST', body: uploadForm });
        if (!uploadResponse.ok) {
          throw new Error('Le stockage privé a refusé le fichier. Vérifiez la configuration CORS du bucket et réessayez.');
        }
        await api.post(`/documents/${document.id}/complete`, {});
      } catch (uploadError) {
        try {
          await api.delete(`/documents/${document.id}`);
        } catch (cleanupError) {
          const uploadMessage = uploadError instanceof Error ? uploadError.message : 'Le téléversement a échoué.';
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'Erreur inconnue.';
          throw new Error(`${uploadMessage} Le document provisoire n’a pas pu être supprimé : ${cleanupMessage}`);
        }
        throw uploadError;
      }
      setForm((current) => ({ ...current, offerId: '', file: null, expiresAt: '' }));
    }, 'Document ajouté à la vérification.');
  };
  return <div className="space-y-5">
    {isSeller && <Panel><h2 className="mb-1 font-semibold">Joindre un document à une offre</h2><p className="mb-4 text-sm text-slate-500">Les PDF et ZIP sont déposés dans un stockage privé, avec une limite de 20 Mo.</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="ID de l’offre (optionnel)" type="number" min="1" value={form.offerId} onChange={(event) => setForm((current) => ({ ...current, offerId: event.target.value }))} />
        <label className="text-sm font-medium">Type de document<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{['COA', 'GMP', 'ORIGIN_CERTIFICATE', 'RCP', 'AMM', 'QUOTATION', 'OTHER'].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="text-sm font-medium">Fichier PDF ou ZIP<input required type="file" accept=".pdf,.zip,application/pdf,application/zip" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        <Field label="Date d’expiration" type="date" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} />
        <div className="flex items-end"><button disabled={!approved || busy} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Ajouter le document</button></div>
      </form>
    </Panel>}
    {documents.length === 0 ? <Empty text="Aucun document à afficher." /> : <Panel className="overflow-x-auto p-0"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Expiration</th><th className="px-4 py-3">Vérification</th>{isAdmin && <th />}</tr></thead><tbody>{documents.map((document) => <tr key={document.id} className="border-t border-slate-100"><td className="px-4 py-3"><button onClick={() => void onAction(async () => { const result = await api.get<{ downloadUrl: string }>(`/documents/${document.id}/download-url`); window.location.assign(result.downloadUrl); })} className="font-medium text-teal-800 hover:underline">{document.fileName}</button><span className="block text-xs text-slate-500">Organisation #{document.ownerOrgId}</span></td><td className="px-4 py-3">{document.type}</td><td className="px-4 py-3">{date(document.expiresAt)}</td><td className="px-4 py-3"><Badge status={document.verificationStatus} /></td>{isAdmin && <td className="px-4 py-3">{document.verificationStatus === 'PENDING' && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/documents/${document.id}/verification`, { verificationStatus: 'APPROVED' }).then(() => undefined), 'Document approuvé.')} className="text-sm font-semibold text-teal-800">Approuver</button>}</td>}</tr>)}</tbody></table></Panel>}
  </div>;
}

function PurchaseOrders({ orders, user, busy, onAction }: {
  orders: PurchaseOrderRecord[];
  user: TenderUser;
  busy: boolean;
  onAction: (action: () => Promise<void>, message?: string) => Promise<void>;
}) {
  if (!orders.length) return <Empty text="Aucun bon de commande disponible." />;
  return <div className="grid gap-4 lg:grid-cols-2">{orders.map((order) => {
    const canAcknowledge = user.role === 'SELLER' && order.status === 'ISSUED';
    const canFulfill = user.role === 'BUYER' && order.status === 'ACKNOWLEDGED';
    return <Panel key={order.id}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{order.number}</p><h2 className="mt-1 font-semibold">{order.tender.title}</h2></div><Badge status={order.status} /></div>
      <p className="mt-3 text-sm text-slate-600">{order.tender.reference} · {money(order.amount, order.currency)}</p>
      <div className="mt-4 flex gap-2">{canAcknowledge && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/purchase-orders/${order.id}/status`, { status: 'ACKNOWLEDGED' }).then(() => undefined), 'Bon de commande accepté.')} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Accuser réception</button>}
        {canFulfill && <button disabled={busy} onClick={() => void onAction(() => api.patch(`/purchase-orders/${order.id}/status`, { status: 'FULFILLED' }).then(() => undefined), 'Commande marquée comme exécutée.')} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Marquer exécuté</button>}</div>
    </Panel>;
  })}</div>;
}

export default WorkspacePage;
