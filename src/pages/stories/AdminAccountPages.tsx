import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { ApiError, api } from '@/lib/api';
import { translateFrenchText } from '@/lib/localization';

type Language = 'ar' | 'en' | 'fr';
type ManagedUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'READER';
  status: string;
};

const accountCopy: Record<string, Record<Language, string>> = {
  'Les nouveaux mots de passe ne correspondent pas.': { ar: 'كلمتا المرور الجديدتان غير متطابقتين.', en: 'The new passwords do not match.', fr: 'Les nouveaux mots de passe ne correspondent pas.' },
  'Impossible de modifier le mot de passe.': { ar: 'تعذر تغيير كلمة المرور.', en: 'Could not change the password.', fr: 'Impossible de modifier le mot de passe.' },
  'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.': { ar: 'تم تغيير كلمة المرور. أعد تسجيل الدخول باستخدام كلمة المرور الجديدة.', en: 'Password changed. Sign in again with your new password.', fr: 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.' },
  'Changer le mot de passe administrateur': { ar: 'تغيير كلمة مرور المسؤول', en: 'Change administrator password', fr: 'Changer le mot de passe administrateur' },
  'Choisissez au moins 14 caractères avec une minuscule, une majuscule, un chiffre et un symbole.': { ar: 'اختر 14 حرفًا على الأقل مع حرف صغير وحرف كبير ورقم ورمز.', en: 'Use at least 14 characters with a lowercase letter, an uppercase letter, a number, and a symbol.', fr: 'Choisissez au moins 14 caractères avec une minuscule, une majuscule, un chiffre et un symbole.' },
  'Vous devez changer le mot de passe initial avant de continuer.': { ar: 'يجب تغيير كلمة المرور الأولية قبل المتابعة.', en: 'You must change the initial password before continuing.', fr: 'Vous devez changer le mot de passe initial avant de continuer.' },
  'Mot de passe actuel': { ar: 'كلمة المرور الحالية', en: 'Current password', fr: 'Mot de passe actuel' },
  'Nouveau mot de passe': { ar: 'كلمة المرور الجديدة', en: 'New password', fr: 'Nouveau mot de passe' },
  'Confirmer le mot de passe': { ar: 'تأكيد كلمة المرور', en: 'Confirm password', fr: 'Confirmer le mot de passe' },
  'Enregistrement…': { ar: 'جارٍ الحفظ…', en: 'Saving…', fr: 'Enregistrement…' },
  'Enregistrer et se reconnecter': { ar: 'حفظ وإعادة تسجيل الدخول', en: 'Save and sign in again', fr: 'Enregistrer et se reconnecter' },
  'Impossible de réinitialiser ce mot de passe.': { ar: 'تعذر إعادة تعيين كلمة المرور.', en: 'Could not reset this password.', fr: 'Impossible de réinitialiser ce mot de passe.' },
  'Le lien de réinitialisation est incomplet ou invalide.': { ar: 'رابط إعادة التعيين غير مكتمل أو غير صالح.', en: 'The reset link is incomplete or invalid.', fr: 'Le lien de réinitialisation est incomplet ou invalide.' },
  'Retour au portail administrateur': { ar: 'العودة إلى بوابة الإدارة', en: 'Back to the admin portal', fr: 'Retour au portail administrateur' },
  'Définir un nouveau mot de passe': { ar: 'تعيين كلمة مرور جديدة', en: 'Set a new password', fr: 'Définir un nouveau mot de passe' },
  'Minimum 14 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.': { ar: '14 حرفًا على الأقل، مع حرف صغير وحرف كبير ورقم ورمز.', en: 'At least 14 characters, including lowercase, uppercase, a number, and a symbol.', fr: 'Minimum 14 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.' },
  'Aller à la connexion': { ar: 'الانتقال إلى تسجيل الدخول', en: 'Go to sign in', fr: 'Aller à la connexion' },
  'Mot de passe défini. Connectez-vous sur le portail administrateur.': { ar: 'تم تعيين كلمة المرور. سجّل الدخول من بوابة الإدارة.', en: 'Password set. Sign in through the admin portal.', fr: 'Mot de passe défini. Connectez-vous sur le portail administrateur.' },
  'Impossible de vérifier le code.': { ar: 'تعذر التحقق من الرمز.', en: 'Could not verify the code.', fr: 'Impossible de vérifier le code.' },
  'Impossible de renvoyer le code.': { ar: 'تعذر إعادة إرسال الرمز.', en: 'Could not resend the code.', fr: 'Impossible de renvoyer le code.' },
  'Impossible de créer le compte administrateur.': { ar: 'تعذر إنشاء حساب المسؤول.', en: 'Could not create the administrator account.', fr: 'Impossible de créer le compte administrateur.' },
  'Le lien d’invitation est incomplet ou invalide.': { ar: 'رابط الدعوة غير مكتمل أو غير صالح.', en: 'The invitation link is incomplete or invalid.', fr: 'Le lien d’invitation est incomplet ou invalide.' },
  'Code de vérification': { ar: 'رمز التحقق', en: 'Verification code', fr: 'Code de vérification' },
  'Vérifier le code': { ar: 'تحقق من الرمز', en: 'Verify code', fr: 'Vérifier le code' },
  'Renvoyer le code': { ar: 'إعادة إرسال الرمز', en: 'Resend code', fr: 'Renvoyer le code' },
  'Invitation vérifiée': { ar: 'تم التحقق من الدعوة', en: 'Invitation verified', fr: 'Invitation vérifiée' },
  'Prénom': { ar: 'الاسم الأول', en: 'First name', fr: 'Prénom' },
  'Nom': { ar: 'اسم العائلة', en: 'Last name', fr: 'Nom' },
  'Mot de passe': { ar: 'كلمة المرور', en: 'Password', fr: 'Mot de passe' },
  'Créer le compte': { ar: 'إنشاء الحساب', en: 'Create account', fr: 'Créer le compte' },
  'Impossible de charger les utilisateurs.': { ar: 'تعذر تحميل المستخدمين.', en: 'Could not load users.', fr: 'Impossible de charger les utilisateurs.' },
  'Le rôle a été modifié. La session précédente a été invalidée.': { ar: 'تم تغيير الدور وإبطال الجلسة السابقة.', en: 'Role updated. The previous session was invalidated.', fr: 'Le rôle a été modifié. La session précédente a été invalidée.' },
  'Impossible de modifier le rôle.': { ar: 'تعذر تغيير الدور.', en: 'Could not update the role.', fr: 'Impossible de modifier le rôle.' },
  'Impossible d’envoyer le lien de réinitialisation.': { ar: 'تعذر إرسال رابط إعادة التعيين.', en: 'Could not send the reset link.', fr: 'Impossible d’envoyer le lien de réinitialisation.' },
  'Impossible d’envoyer l’invitation.': { ar: 'تعذر إرسال الدعوة.', en: 'Could not send the invitation.', fr: 'Impossible d’envoyer l’invitation.' },
  'Un lien de réinitialisation à usage unique a été envoyé.': { ar: 'تم إرسال رابط إعادة تعيين صالح للاستخدام مرة واحدة.', en: 'A single-use reset link has been sent.', fr: 'Un lien de réinitialisation à usage unique a été envoyé.' },
  'Invitation envoyée. Le nouvel administrateur doit vérifier son adresse avant la création du compte.': { ar: 'تم إرسال الدعوة. يجب على المسؤول الجديد التحقق من بريده قبل إنشاء الحساب.', en: 'Invitation sent. The new administrator must verify their email before the account is created.', fr: 'Invitation envoyée. Le nouvel administrateur doit vérifier son adresse avant la création du compte.' },
  'La gestion des comptes administrateur est réservée au superadministrateur.': { ar: 'إدارة حسابات المسؤولين متاحة للمسؤول الأعلى فقط.', en: 'Only the superadmin can manage administrator accounts.', fr: 'La gestion des comptes administrateur est réservée au superadministrateur.' },
  'Seul le superadministrateur peut modifier les rôles ou envoyer un lien de réinitialisation.': { ar: 'المسؤول الأعلى وحده يمكنه تغيير الأدوار أو إرسال رابط إعادة التعيين.', en: 'Only the superadmin can change roles or send reset links.', fr: 'Seul le superadministrateur peut modifier les rôles ou envoyer un lien de réinitialisation.' },
  'Inviter un administrateur': { ar: 'دعوة مسؤول', en: 'Invite an administrator', fr: 'Inviter un administrateur' },
  'Adresse e-mail': { ar: 'البريد الإلكتروني', en: 'Email address', fr: 'Adresse e-mail' },
  'Rôle': { ar: 'الدور', en: 'Role', fr: 'Rôle' },
  'Envoyer une invitation': { ar: 'إرسال دعوة', en: 'Send invitation', fr: 'Envoyer une invitation' },
  'Envoi…': { ar: 'جارٍ الإرسال…', en: 'Sending…', fr: 'Envoi…' },
  'Utilisateur': { ar: 'المستخدم', en: 'User', fr: 'Utilisateur' },
  'État': { ar: 'الحالة', en: 'Status', fr: 'État' },
  'Actions': { ar: 'الإجراءات', en: 'Actions', fr: 'Actions' },
  'Enregistrer le rôle': { ar: 'حفظ الدور', en: 'Save role', fr: 'Enregistrer le rôle' },
  'Envoyer un lien de réinitialisation': { ar: 'إرسال رابط إعادة التعيين', en: 'Send reset link', fr: 'Envoyer un lien de réinitialisation' },
  'Le compte administrateur a été activé.': { ar: 'تم تفعيل حساب المسؤول.', en: 'Administrator account activated.', fr: 'Le compte administrateur a été activé.' },
  'Le compte administrateur a été suspendu.': { ar: 'تم تعليق حساب المسؤول.', en: 'Administrator account suspended.', fr: 'Le compte administrateur a été suspendu.' },
  'Impossible de modifier l’état du compte.': { ar: 'تعذر تغيير حالة الحساب.', en: 'Could not change the account status.', fr: 'Impossible de modifier l’état du compte.' },
  'Activer le compte': { ar: 'تفعيل الحساب', en: 'Activate account', fr: 'Activer le compte' },
  'Suspendre le compte': { ar: 'تعليق الحساب', en: 'Suspend account', fr: 'Suspendre le compte' }
};

const roleLabels: Record<Language, Record<ManagedUser['role'], string>> = {
  ar: { SUPER_ADMIN: 'المسؤول الأعلى', ADMIN: 'مسؤول', EDITOR: 'محرر', REVIEWER: 'مراجع', READER: 'قارئ' },
  en: { SUPER_ADMIN: 'Superadmin', ADMIN: 'Admin', EDITOR: 'Editor', REVIEWER: 'Reviewer', READER: 'Reader' },
  fr: { SUPER_ADMIN: 'Superadministrateur', ADMIN: 'Administrateur', EDITOR: 'Éditeur', REVIEWER: 'Réviseur', READER: 'Lecteur' }
};

function useAdminCopy() {
  const { locale = 'ar' } = useParams();
  const language: Language = ['ar', 'en', 'fr'].includes(locale) ? locale as Language : 'ar';
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const t = useCallback((text: string) => accountCopy[text]?.[language] || translateFrenchText(text, language), [language]);
  return { language, t };
}

export function AdminChangePasswordPage() {
  const { language, t } = useAdminCopy();
  const { user, logout } = useStoryAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword !== confirmation) {
      setError(t('Les nouveaux mots de passe ne correspondent pas.'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>('/admin/superadmin/change-password', {
        currentPassword,
        newPassword
      });
      setNotice(t(result.message));
      logout();
      navigate(`/${language}/admin/login`, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de modifier le mot de passe.'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <h1 className="text-2xl font-black">{t('Changer le mot de passe administrateur')}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">{t('Choisissez au moins 14 caractères avec une minuscule, une majuscule, un chiffre et un symbole.')}</p>
    {user?.mustChangePassword && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Vous devez changer le mot de passe initial avant de continuer.')}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <form onSubmit={submit} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">{t('Mot de passe actuel')}<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-semibold">{t('Nouveau mot de passe')}<input type="password" autoComplete="new-password" minLength={14} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-semibold">{t('Confirmer le mot de passe')}<input type="password" autoComplete="new-password" minLength={14} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <button disabled={busy} className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t(busy ? 'Enregistrement…' : 'Enregistrer et se reconnecter')}</button>
    </form>
  </section>;
}

export function AdminPasswordResetPage() {
  const { language, t } = useAdminCopy();
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError(t('Les nouveaux mots de passe ne correspondent pas.'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>('/admin/auth/reset-password', {
        email,
        token,
        newPassword
      });
      setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof ApiError ? t(caught.message) : t('Impossible de réinitialiser ce mot de passe.'));
    } finally {
      setBusy(false);
    }
  }

  if (!email || !token) {
    return <main className="mx-auto mt-16 max-w-xl rounded-2xl bg-white p-8 text-center">
      <p role="alert">{t('Le lien de réinitialisation est incomplet ou invalide.')}</p>
      <Link to={`/${language}/admin/login`} className="mt-4 inline-block font-bold text-emerald-800 underline">{t('Retour au portail administrateur')}</Link>
    </main>;
  }

  return <main className="mx-auto mt-16 max-w-xl rounded-2xl border border-slate-200 bg-white p-8">
    <h1 className="text-2xl font-black">{t('Définir un nouveau mot de passe')}</h1>
    <p className="mt-2 text-sm text-slate-600" dir="ltr">{email}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice ? <div className="mt-4"><p role="status">{t(notice)}</p><Link to={`/${language}/admin/login`} className="mt-4 inline-block font-bold text-emerald-800 underline">{t('Aller à la connexion')}</Link></div> :
      <form onSubmit={submit} className="mt-5 space-y-4">
        <p className="text-sm leading-6 text-slate-600">{t('Minimum 14 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.')}</p>
        <label className="block text-sm font-semibold">{t('Nouveau mot de passe')}<input type="password" autoComplete="new-password" minLength={14} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
        <label className="block text-sm font-semibold">{t('Confirmer le mot de passe')}<input type="password" autoComplete="new-password" minLength={14} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
        <button disabled={busy} className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t(busy ? 'Enregistrement…' : 'Définir le mot de passe')}</button>
      </form>}
  </main>;
}

export function AdminRegisterPage() {
  const { language, t } = useAdminCopy();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [role, setRole] = useState<ManagedUser['role']>('ADMIN');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function verifyInvitation(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.post<{ verificationToken: string; role: ManagedUser['role'] }>('/admin/auth/register/verify-code', { email, code });
      setVerificationToken(result.verificationToken);
      setRole(result.role);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de vérifier le code.'));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>('/admin/auth/register/request-code', { email, language });
      setNotice(t(result.message));
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de renvoyer le code.'));
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password !== confirmation) {
      setError(t('Les nouveaux mots de passe ne correspondent pas.'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.postWithBearer<{ message: string }>('/admin/auth/register', {
        email,
        firstName,
        lastName,
        role,
        password
      }, verificationToken);
      setNotice(t(result.message));
      setRegistered(true);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de créer le compte administrateur.'));
    } finally {
      setBusy(false);
    }
  }

  if (!email) return <main className="mx-auto mt-16 max-w-xl rounded-2xl bg-white p-8 text-center">
    <p role="alert">{t('Le lien d’invitation est incomplet ou invalide.')}</p>
    <Link to={`/${language}/admin/login`} className="mt-4 inline-block font-bold text-emerald-800 underline">{t('Retour au portail administrateur')}</Link>
  </main>;

  return <main className="mx-auto mt-16 max-w-xl rounded-2xl border border-slate-200 bg-white p-8">
    <h1 className="text-2xl font-black">{t('Invitation administrateur')}</h1>
    <p className="mt-2 text-sm text-slate-600" dir="ltr">{email}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {registered ? <Link to={`/${language}/admin/login`} className="mt-4 inline-block font-bold text-emerald-800 underline">{t('Aller à la connexion')}</Link>
      : !verificationToken ? <form onSubmit={verifyInvitation} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">{t('Code de vérification')}<input required inputMode="numeric" pattern="[0-9]{8}" value={code} onChange={(event) => setCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t('Vérifier le code')}</button>
        <button type="button" disabled={busy} onClick={() => void resendCode()} className="rounded-xl border border-slate-300 px-5 py-3 font-bold disabled:opacity-50">{t('Renvoyer le code')}</button>
      </div>
    </form> : <form onSubmit={completeRegistration} className="mt-5 space-y-4">
      <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{t('Invitation vérifiée')} — {roleLabels[language][role]}</p>
      <label className="block text-sm font-semibold">{t('Prénom')}<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-semibold">{t('Nom')}<input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-semibold">{t('Mot de passe')}<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-semibold">{t('Confirmer le mot de passe')}<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <button disabled={busy} className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t('Créer le compte')}</button>
    </form>}
  </main>;
}

export function AdminUsersPage() {
  const { language, t } = useAdminCopy();
  const { user } = useStoryAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Record<number, ManagedUser['role']>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', role: 'ADMIN' as 'ADMIN' | 'EDITOR' | 'REVIEWER' });
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<ManagedUser[]>('/admin/users').then((items) => {
      if (active) {
        setUsers(items);
        setRoles(Object.fromEntries(items.map((item) => [item.id, item.role])));
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? t(caught.message) : t('Impossible de charger les utilisateurs.'));
    });
    return () => { active = false; };
  }, [t]);

  async function saveRole(target: ManagedUser) {
    setError('');
    setNotice('');
    setBusyId(target.id);
    try {
      const result = await api.patch<{ user: ManagedUser }>(`/admin/users/${target.id}/role`, { role: roles[target.id] });
      setUsers((current) => current.map((item) => item.id === target.id ? result.user : item));
      setNotice(t('Le rôle a été modifié. La session précédente a été invalidée.'));
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de modifier le rôle.'));
    } finally {
      setBusyId(null);
    }
  }

  async function sendReset(target: ManagedUser) {
    setError('');
    setNotice('');
    setBusyId(target.id);
    try {
      const result = await api.post<{ message: string }>(`/admin/users/${target.id}/reset-password`, {});
      setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible d’envoyer le lien de réinitialisation.'));
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvitation(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setInviteBusy(true);
    try {
      const result = await api.post<{ message: string }>('/admin/auth/invitations', { ...invite, language });
      setNotice(t(result.message));
      setInvite({ email: '', firstName: '', lastName: '', role: 'ADMIN' });
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible d’envoyer l’invitation.'));
    } finally {
      setInviteBusy(false);
    }
  }

  async function updateAdminStatus(target: ManagedUser, status: 'ACTIVE' | 'SUSPENDED') {
    setError('');
    setNotice('');
    setBusyId(target.id);
    try {
      await api.patch(`/admin/auth/admins/${target.id}/approval`, { status });
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, status } : item));
      setNotice(t(status === 'ACTIVE' ? 'Le compte administrateur a été activé.' : 'Le compte administrateur a été suspendu.'));
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Impossible de modifier l’état du compte.'));
    } finally {
      setBusyId(null);
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return <p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">{t('La gestion des comptes administrateur est réservée au superadministrateur.')}</p>;
  }

  return <section className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-3xl font-black">{t('Utilisateurs et rôles')}</h1><p className="mt-2 text-sm text-slate-600">{t('Seul le superadministrateur peut modifier les rôles ou envoyer un lien de réinitialisation.')}</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <form onSubmit={sendInvitation} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <h2 className="text-lg font-bold sm:col-span-2">{t('Inviter un administrateur')}</h2>
      <label className="text-sm font-semibold">{t('Adresse e-mail')}<input type="email" required value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">{t('Prénom')}<input required value={invite.firstName} onChange={(event) => setInvite((current) => ({ ...current, firstName: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">{t('Nom')}<input required value={invite.lastName} onChange={(event) => setInvite((current) => ({ ...current, lastName: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">{t('Rôle')}<select value={invite.role} onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value as typeof current.role }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5">{(['ADMIN', 'EDITOR', 'REVIEWER'] as const).map((role) => <option key={role} value={role}>{roleLabels[language][role]}</option>)}</select></label>
      <button disabled={inviteBusy} className="w-fit rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{t(inviteBusy ? 'Envoi…' : 'Envoyer une invitation')}</button>
    </form>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[780px] text-start text-sm">
        <thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-3">{t('Utilisateur')}</th><th className="p-3">{t('Rôle')}</th><th className="p-3">{t('État')}</th><th className="p-3">{t('Actions')}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{users.map((target) => <tr key={target.id}>
          <td className="p-3"><p className="font-bold">{target.firstName} {target.lastName}</p><p dir="ltr" className="text-xs text-slate-500">{target.email}</p></td>
          <td className="p-3"><select aria-label={`${t('Rôle')} ${target.email}`} value={roles[target.id]} disabled={target.role === 'SUPER_ADMIN'} onChange={(event) => setRoles((current) => ({ ...current, [target.id]: event.target.value as ManagedUser['role'] }))} className="rounded-lg border border-slate-300 px-2 py-1.5">{(['READER', 'EDITOR', 'REVIEWER', 'ADMIN'] as const).map((role) => <option key={role} value={role}>{roleLabels[language][role]}</option>)}</select></td>
          <td className="p-3">{t(target.status)}</td>
          <td className="p-3"><div className="flex flex-wrap gap-3">
            {target.role !== 'SUPER_ADMIN' && <button type="button" onClick={() => void saveRole(target)} disabled={busyId === target.id || roles[target.id] === target.role} className="font-bold text-emerald-800 underline disabled:opacity-40">{t('Enregistrer le rôle')}</button>}
            {['ADMIN', 'EDITOR', 'REVIEWER'].includes(target.role) && target.status === 'PENDING' && <button type="button" onClick={() => void updateAdminStatus(target, 'ACTIVE')} disabled={busyId === target.id} className="font-bold text-emerald-800 underline disabled:opacity-40">{t('Activer le compte')}</button>}
            {['ADMIN', 'EDITOR', 'REVIEWER'].includes(target.role) && target.status === 'ACTIVE' && <button type="button" onClick={() => void updateAdminStatus(target, 'SUSPENDED')} disabled={busyId === target.id} className="font-bold text-amber-800 underline disabled:opacity-40">{t('Suspendre le compte')}</button>}
            {['ADMIN', 'EDITOR', 'REVIEWER'].includes(target.role) && <button type="button" onClick={() => void sendReset(target)} disabled={busyId === target.id} className="font-bold text-amber-800 underline disabled:opacity-40">{t('Envoyer un lien de réinitialisation')}</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
