import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useTenderAuth, dashboardForRole } from '@/contexts/TenderAuthContext';
import { api, type TenderUser, type UserRole } from '@/lib/tenderApi';
import { localizeAuthError } from '@/lib/authErrors';

type ClientRole = Extract<UserRole, 'BUYER' | 'SELLER'>;
type AuthMode = 'login' | 'admin-login' | 'register' | 'admin-register' | 'admin-invite';
type AuthStage = 'credentials' | 'code' | 'details' | 'forgot-email' | 'forgot-code' | 'forgot-password' | 'complete';

const translations = {
  fr: {
    back: 'Retour à l’accueil', login: 'Connexion à MediTender', register: 'Vérifier votre adresse e-mail',
    descriptionLogin: 'Accédez à vos appels d’offres, réponses et documents.',
    descriptionRegister: 'Confirmez votre adresse e-mail avant de créer votre compte organisation.',
    email: 'Adresse e-mail', password: 'Mot de passe', code: 'Code de vérification',
    forgotPassword: 'Mot de passe oublié ?', newPassword: 'Nouveau mot de passe',
    backToLogin: 'Retour à la connexion',
    confirmPassword: 'Confirmer le nouveau mot de passe',
    resetCodeSent: 'Si un compte actif existe pour cette adresse, un code de réinitialisation vient de lui être envoyé.',
    enterNewPassword: 'Code vérifié. Vous pouvez choisir un nouveau mot de passe.',
    passwordUpdated: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.',
    passwordMismatch: 'Les deux mots de passe ne correspondent pas.',
    resetDescription: 'Saisissez l’adresse e-mail de votre compte pour recevoir un code de réinitialisation.',
    emailAlreadyUsed: 'Cette adresse e-mail est déjà associée à un compte. Connectez-vous ou utilisez une autre adresse.',
    resendWait: 'Veuillez patienter avant de demander un nouveau code.',
    tooManyAttempts: 'Trop de tentatives. Demandez un nouveau code et réessayez.',
    invalidCode: 'Le code est incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.',
    unverifiedEmailError: 'Votre adresse e-mail n’est pas vérifiée. Renvoyez le code pour continuer.',
    invalidCredentials: 'Adresse e-mail ou mot de passe incorrect. Vérifiez vos identifiants et réessayez.',
    slowRequest: 'La demande prend plus de temps que prévu. Vérifiez votre connexion et réessayez.',
    genericError: 'Une erreur est survenue. Réessayez dans un instant.',
    sendCode: 'Envoyer le code', verify: 'Vérifier le code', resend: 'Renvoyer le code',
    continue: 'Continuer', submit: 'Créer le compte', loginButton: 'Se connecter',
    firstName: 'Prénom', lastName: 'Nom', legalName: 'Raison sociale', country: 'Pays',
    address: 'Adresse professionnelle', registrationNumber: 'Numéro d’enregistrement',
    pharmaceuticalLicense: 'Licence pharmaceutique', language: 'Langue préférée',
    wrongCode: 'Le code doit contenir 6 chiffres.', adminWrongCode: 'Le code doit contenir 8 chiffres.',
    codeSent: 'Un code de vérification a été envoyé par e-mail.',
    pendingAdmin: 'Votre adresse est vérifiée. Le compte attend l’autorisation de l’administrateur principal.',
    seller: 'Organisation vendeuse', buyer: 'Organisation acheteuse',
    chooseRole: 'Choisissez le type d’organisation à inscrire.',
    sellerAccount: 'Créer un compte vendeur', buyerAccount: 'Créer un compte acheteur',
    adminLogin: 'Connexion administrateur', adminInvite: 'Inviter un administrateur',
    noAccount: 'Pas encore de compte ?', createAccount: 'Créer un compte',
    haveAccount: 'Vous avez déjà un compte ?', signIn: 'Se connecter',
    retry: 'Le code est invalide ou expiré. Vérifiez-le ou demandez-en un nouveau.',
    emailUnverified: 'Votre adresse e-mail n’est pas vérifiée. Renvoyez le code pour continuer.',
    resendSent: 'Un nouveau code a été envoyé.',
    pendingTitle: 'Administrateurs en attente',
    approve: 'Autoriser', reject: 'Refuser', invitationSent: 'Invitation envoyée.',
    organizationPending: 'Compte créé. L’organisation attend la validation de l’administration.',
    save: 'Enregistrer', loading: 'Chargement…', inviteEmail: 'E-mail du nouvel administrateur',
    adminOnly: 'Cette page est réservée à l’administrateur principal.'
  },
  en: {
    back: 'Back to home', login: 'Sign in to MediTender', register: 'Verify your email address',
    descriptionLogin: 'Access your tenders, bids, and documents.',
    descriptionRegister: 'Confirm your email before creating your organization account.',
    email: 'Email address', password: 'Password', code: 'Verification code',
    forgotPassword: 'Forgot password?', newPassword: 'New password',
    backToLogin: 'Back to sign in',
    confirmPassword: 'Confirm new password',
    resetCodeSent: 'If an active account exists for this address, a reset code has been sent to it.',
    enterNewPassword: 'Code verified. You can now choose a new password.',
    passwordUpdated: 'Your password has been changed. You can sign in now.',
    passwordMismatch: 'The passwords do not match.',
    resetDescription: 'Enter your account email address to receive a password reset code.',
    emailAlreadyUsed: 'This email address is already linked to an account. Sign in or use another address.',
    resendWait: 'Please wait before requesting another code.',
    tooManyAttempts: 'Too many attempts. Request a new code and try again.',
    invalidCode: 'The code is incorrect or expired. Check it or request a new one.',
    unverifiedEmailError: 'Your email address is not verified. Resend the code to continue.',
    invalidCredentials: 'Incorrect email address or password. Check your credentials and try again.',
    slowRequest: 'The request is taking longer than expected. Check your connection and try again.',
    genericError: 'Something went wrong. Please try again shortly.',
    sendCode: 'Send code', verify: 'Verify code', resend: 'Resend code',
    continue: 'Continue', submit: 'Create account', loginButton: 'Sign in',
    firstName: 'First name', lastName: 'Last name', legalName: 'Legal name', country: 'Country',
    address: 'Business address', registrationNumber: 'Registration number',
    pharmaceuticalLicense: 'Pharmaceutical license', language: 'Preferred language',
    wrongCode: 'The code must contain 6 digits.', adminWrongCode: 'The code must contain 8 digits.',
    codeSent: 'A verification code has been sent by email.',
    pendingAdmin: 'Your email is verified. The account is awaiting approval from the super administrator.',
    seller: 'Seller organization', buyer: 'Buyer organization',
    chooseRole: 'Choose the organization type to register.',
    sellerAccount: 'Create a seller account', buyerAccount: 'Create a buyer account',
    adminLogin: 'Administrator sign in', adminInvite: 'Invite an administrator',
    noAccount: 'No account yet?', createAccount: 'Create an account',
    haveAccount: 'Already have an account?', signIn: 'Sign in',
    retry: 'The code is invalid or expired. Check it or request a new one.',
    emailUnverified: 'Your email address is not verified. Resend the code to continue.',
    resendSent: 'A new code has been sent.',
    pendingTitle: 'Administrators awaiting approval',
    approve: 'Approve', reject: 'Reject', invitationSent: 'Invitation sent.',
    organizationPending: 'Account created. The organization is awaiting admin verification.',
    save: 'Save', loading: 'Loading…', inviteEmail: 'New administrator email',
    adminOnly: 'This page is for the super administrator only.'
  },
  ar: {
    back: 'العودة إلى الصفحة الرئيسية', login: 'تسجيل الدخول إلى MediTender', register: 'تحقق من بريدك الإلكتروني',
    descriptionLogin: 'الوصول إلى المناقصات والعروض والمستندات.',
    descriptionRegister: 'أكد بريدك الإلكتروني قبل إنشاء حساب المؤسسة.',
    email: 'عنوان البريد الإلكتروني', password: 'كلمة المرور', code: 'رمز التحقق',
    forgotPassword: 'هل نسيت كلمة المرور؟', newPassword: 'كلمة مرور جديدة',
    backToLogin: 'العودة إلى تسجيل الدخول',
    confirmPassword: 'تأكيد كلمة المرور الجديدة',
    resetCodeSent: 'إذا وُجد حساب نشط بهذا العنوان، فسيصل إليه رمز إعادة التعيين.',
    enterNewPassword: 'تم التحقق من الرمز. يمكنك الآن اختيار كلمة مرور جديدة.',
    passwordUpdated: 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.',
    passwordMismatch: 'كلمتا المرور غير متطابقتين.',
    resetDescription: 'أدخل عنوان البريد الإلكتروني لحسابك لاستلام رمز إعادة تعيين كلمة المرور.',
    emailAlreadyUsed: 'عنوان البريد هذا مرتبط بحساب بالفعل. سجّل الدخول أو استخدم عنواناً آخر.',
    resendWait: 'يرجى الانتظار قبل طلب رمز جديد.',
    tooManyAttempts: 'محاولات كثيرة. اطلب رمزاً جديداً ثم حاول مرة أخرى.',
    invalidCode: 'الرمز غير صحيح أو منتهي الصلاحية. تحقق منه أو اطلب رمزاً جديداً.',
    unverifiedEmailError: 'لم يتم التحقق من بريدك الإلكتروني. أعد إرسال الرمز للمتابعة.',
    invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من بياناتك وحاول مجدداً.',
    slowRequest: 'يستغرق الطلب وقتاً أطول من المتوقع. تحقق من اتصالك وحاول مجدداً.',
    genericError: 'حدث خطأ. يرجى المحاولة بعد قليل.',
    sendCode: 'إرسال الرمز', verify: 'تحقق من الرمز', resend: 'إعادة إرسال الرمز',
    continue: 'متابعة', submit: 'إنشاء الحساب', loginButton: 'تسجيل الدخول',
    firstName: 'الاسم الأول', lastName: 'اسم العائلة', legalName: 'الاسم القانوني', country: 'البلد',
    address: 'عنوان العمل', registrationNumber: 'رقم التسجيل',
    pharmaceuticalLicense: 'الترخيص الصيدلاني', language: 'اللغة المفضلة',
    wrongCode: 'يجب أن يتكون الرمز من 6 أرقام.', adminWrongCode: 'يجب أن يتكون الرمز من 8 أرقام.',
    codeSent: 'تم إرسال رمز التحقق عبر البريد الإلكتروني.',
    pendingAdmin: 'تم التحقق من بريدك. الحساب بانتظار موافقة المسؤول الرئيسي.',
    seller: 'مؤسسة موردة', buyer: 'مؤسسة مشترية',
    chooseRole: 'اختر نوع المؤسسة المراد تسجيلها.',
    sellerAccount: 'إنشاء حساب مورد', buyerAccount: 'إنشاء حساب مشترٍ',
    adminLogin: 'دخول المسؤول', adminInvite: 'دعوة مسؤول',
    noAccount: 'ليس لديك حساب؟', createAccount: 'إنشاء حساب',
    haveAccount: 'لديك حساب بالفعل؟', signIn: 'تسجيل الدخول',
    retry: 'الرمز غير صالح أو منتهي. تحقق منه أو اطلب رمزاً جديداً.',
    emailUnverified: 'لم يتم التحقق من بريدك الإلكتروني. أعد إرسال الرمز للمتابعة.',
    resendSent: 'تم إرسال رمز جديد.',
    pendingTitle: 'مسؤولون بانتظار الموافقة',
    approve: 'موافقة', reject: 'رفض', invitationSent: 'تم إرسال الدعوة.',
    organizationPending: 'تم إنشاء الحساب. المؤسسة بانتظار موافقة الإدارة.',
    save: 'حفظ', loading: 'جار التحميل…', inviteEmail: 'بريد المسؤول الجديد',
    adminOnly: 'هذه الصفحة مخصصة للمسؤول الرئيسي فقط.'
  }
} as const;

interface AuthPageProps {
  mode: AuthMode;
  role?: ClientRole;
}

interface AdminInvitation {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export default function AuthPage({ mode, role }: AuthPageProps) {
  const isLogin = mode === 'login' || mode === 'admin-login';
  const isAdmin = mode === 'admin-login' || mode === 'admin-register' || mode === 'admin-invite';
  const { user, login, adminLogin, verifyAdminCode, requestRegistrationCode, verifyRegistrationCode, register } = useTenderAuth();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const navigate = useNavigate();
  const [language, setLanguage] = useState<'fr' | 'en' | 'ar'>('fr');
  const text = translations[language];
  const [stage, setStage] = useState<AuthStage>(() => {
    if (mode === 'register' && searchParams.get('verify') === '1') return 'code';
    if (mode === 'admin-login' && searchParams.get('verify') === '1') return 'code';
    if (isLogin && searchParams.get('reset') === '1') return 'forgot-code';
    return 'credentials';
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState(false);
  const [code, setCode] = useState('');
  const [pendingAdmins, setPendingAdmins] = useState<AdminInvitation[]>([]);
  const [invitation, setInvitation] = useState({
    email: searchParams.get('email') || '', firstName: '', lastName: '', password: '',
    legalName: '', country: '', address: '', registrationNumber: '', pharmaceuticalLicense: ''
  });

  const change = (field: keyof typeof invitation, value: string) =>
    setInvitation((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (mode !== 'admin-invite' || user?.role !== 'SUPER_ADMIN') return;
    void api.get<AdminInvitation[]>('/admin/auth/admins/pending')
      .then(setPendingAdmins)
      .catch(setError);
  }, [mode, user?.role, text.retry]);

  if (user && isLogin) return <Navigate to={dashboardForRole(user.role)} replace />;
  if (user && mode === 'admin-invite' && user.role !== 'SUPER_ADMIN') {
    return <Navigate to={dashboardForRole(user.role)} replace />;
  }

  const execute = async (event: FormEvent<HTMLFormElement>, action: () => Promise<void>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
    } catch (caught) {
      const originalMessage = caught instanceof Error ? caught.message.toLowerCase() : '';
      setError(caught);
      if (isLogin && !isAdmin && /adresse e-mail n’est pas vérifiée|email address is not verified/.test(originalMessage)) {
        setUnverifiedEmail(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordResetCode = async () => {
    const response = await api.post<{ message: string }>('/auth/password/request-code', {
      email: invitation.email,
      language
    });
    setStage('forgot-code');
    setInfo(text.resetCodeSent);
  };

  const resendPasswordResetCode = async () => {
    setBusy(true);
    setError('');
    try {
      await requestPasswordResetCode();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const requestClientCode = async () => {
    if (!role) return;
    const message = await requestRegistrationCode(role, invitation.email, language);
    setInfo(message || text.codeSent);
    setStage('code');
  };

  const resendUnverifiedCode = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await api.post<{ message: string }>('/auth/email/request-code', {
        email: invitation.email,
        language
      });
      setInfo(response.message || text.resendSent);
      setStage('code');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const resendAdminRegistrationCode = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await api.post<{ message: string }>('/admin/auth/register/request-code', {
        email: invitation.email,
        language
      });
      setInfo(response.message || text.resendSent);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async () => {
    if (!role && !isAdmin) return;
    if (isAdmin) {
      const response = await api.postWithBearer<{ message: string }>('/admin/auth/register', {
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        password: invitation.password,
        language
      }, verificationToken);
      setInfo(response.message || text.pendingAdmin);
      setStage('complete');
      return;
    }
    const message = await register(role, {
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      email: invitation.email,
      password: invitation.password,
      language,
      legalName: invitation.legalName,
      country: invitation.country,
      address: invitation.address,
      registrationNumber: invitation.registrationNumber,
      ...(role === 'SELLER' ? { pharmaceuticalLicense: invitation.pharmaceuticalLicense } : {})
    }, verificationToken);
    setInfo(message || text.organizationPending);
    setStage('complete');
  };

  if (mode === 'register' && !role) {
    return <AuthShell language={language} setLanguage={setLanguage} title={text.createAccount} description={text.chooseRole}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/register/buyer" className="rounded-xl border border-slate-200 p-5 text-center font-semibold text-teal-800 hover:border-teal-600 hover:bg-teal-50">{text.buyerAccount}</Link>
        <Link to="/register/seller" className="rounded-xl border border-slate-200 p-5 text-center font-semibold text-teal-800 hover:border-teal-600 hover:bg-teal-50">{text.sellerAccount}</Link>
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">{text.haveAccount} <Link className="font-semibold text-teal-700" to="/login">{text.signIn}</Link></p>
    </AuthShell>;
  }

  if (mode === 'admin-invite') {
    if (user?.role !== 'SUPER_ADMIN') {
      return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">{text.adminOnly}</p></div>;
    }
    return <AuthShell language={language} setLanguage={setLanguage} title={text.adminInvite} description={text.pendingAdmin}>
      <form onSubmit={(event) => void execute(event, async () => {
        const response = await api.post<{ message: string }>('/admin/auth/invitations', {
          email: invitation.email, firstName: invitation.firstName, lastName: invitation.lastName, language
        });
        setInfo(response.message || text.invitationSent);
      })} className="space-y-4">
        <AuthField label={text.firstName} value={invitation.firstName} onChange={(value) => change('firstName', value)} required />
        <AuthField label={text.lastName} value={invitation.lastName} onChange={(value) => change('lastName', value)} required />
        <AuthField label={text.inviteEmail} type="email" value={invitation.email} onChange={(value) => change('email', value)} required />
        <SubmitButton busy={busy} label={text.sendCode} />
      </form>
      <h2 className="mt-8 font-semibold">{text.pendingTitle}</h2>
      <ul className="mt-3 space-y-3">
        {pendingAdmins.map((admin) => <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <span>{admin.firstName} {admin.lastName} · {admin.email}</span>
          <div className="flex gap-2">
            <button onClick={() => void api.patch(`/admin/auth/admins/${admin.id}/approval`, { status: 'ACTIVE' }).then(() => setPendingAdmins((items) => items.filter((item) => item.id !== admin.id))).catch(setError)} className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white">{text.approve}</button>
            <button onClick={() => void api.patch(`/admin/auth/admins/${admin.id}/approval`, { status: 'SUSPENDED' }).then(() => setPendingAdmins((items) => items.filter((item) => item.id !== admin.id))).catch(setError)} className="rounded-md border border-slate-300 px-3 py-1.5">{text.reject}</button>
          </div>
        </li>)}
      </ul>
    </AuthShell>;
  }

  const adminRegistration = mode === 'admin-register';
  const registration = mode === 'register' || adminRegistration;
  const registrationRole: ClientRole | undefined = role;
  const adminCodeLength = adminRegistration || (isLogin && isAdmin);

  return <AuthShell
    language={language}
    setLanguage={setLanguage}
    title={isLogin ? (isAdmin ? text.adminLogin : text.login) : registration ? text.register : text.login}
    description={isLogin ? text.descriptionLogin : text.descriptionRegister}
  >
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{localizeAuthError(error, language)}</p>}
    {info && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</p>}

    {stage === 'complete' ? (
      <div className="space-y-4">
        <Link className="block rounded-lg bg-teal-700 px-4 py-3 text-center font-semibold text-white" to={isAdmin ? '/admin/login' : '/login'}>{text.signIn}</Link>
      </div>
    ) : (
      <form onSubmit={(event) => void execute(event, async () => {
        if (isLogin && stage === 'forgot-email') {
          await requestPasswordResetCode();
          return;
        }
        if (isLogin && stage === 'forgot-code') {
          const response = await api.post<{ resetToken: string }>('/auth/password/verify-code', {
            email: invitation.email,
            code
          });
          setPasswordResetToken(response.resetToken);
          setStage('forgot-password');
          setInfo(text.enterNewPassword);
          return;
        }
        if (isLogin && stage === 'forgot-password') {
          if (invitation.password !== confirmPassword) throw new Error(text.passwordMismatch);
          await api.postWithBearer<{ message: string }>('/auth/password/reset', {
            email: invitation.email,
            password: invitation.password
          }, passwordResetToken);
          setInfo(text.passwordUpdated);
          setStage('complete');
          return;
        }
        if (registration && stage === 'credentials') {
          if (adminRegistration) {
            const response = await api.post<{ verificationToken: string }>('/admin/auth/register/verify-code', {
              email: invitation.email, code
            });
            setVerificationToken(response.verificationToken);
            setStage('details');
            setInfo(text.codeSent);
          } else {
            await requestClientCode();
          }
          return;
        }
        if (registration && stage === 'code') {
          const token = await verifyRegistrationCode(registrationRole as ClientRole, invitation.email, code);
          setVerificationToken(token);
          setStage('details');
          setInfo(text.codeSent);
          return;
        }
        if (registration && stage === 'details') {
          await submitRegistration();
          return;
        }
        if (isLogin && isAdmin && stage === 'credentials') {
          const message = await adminLogin(invitation.email, invitation.password);
          setStage('code');
          setInfo(message);
          return;
        }
        if (isLogin && isAdmin && stage === 'code') {
          await verifyAdminCode(invitation.email, code);
          navigate('/admin/dashboard', { replace: true });
          return;
        }
        if (isLogin && !isAdmin && stage === 'code' && unverifiedEmail) {
          const response = await api.post<{ message: string }>('/auth/email/verify-code', {
            email: invitation.email, code
          });
          setInfo(response.message);
          setStage('credentials');
          setUnverifiedEmail(false);
          setCode('');
          return;
        }
        await login(invitation.email, invitation.password);
        const savedUser = await api.get<{ user: TenderUser }>('/auth/me');
        navigate(dashboardForRole(savedUser.user.role), { replace: true });
      })} className="space-y-4">
        {isLogin && stage === 'forgot-email' && <>
          <p className="text-sm text-slate-600">{text.resetDescription}</p>
          <AuthField label={text.email} type="email" autoComplete="email" value={invitation.email} onChange={(value) => change('email', value)} required />
        </>}
        {isLogin && stage === 'forgot-code' && <>
          <p className="text-sm text-slate-600">{text.resetCodeSent}</p>
          <AuthField label={text.email} type="email" value={invitation.email} onChange={(value) => change('email', value)} required />
          <AuthField label={text.code} inputMode="numeric" maxLength={6} value={code} onChange={setCode} required />
          <button type="button" disabled={busy} onClick={() => void resendPasswordResetCode()} className="text-sm font-semibold text-teal-700 disabled:opacity-50">{text.resend}</button>
        </>}
        {isLogin && stage === 'forgot-password' && <>
          <p className="text-sm text-slate-600">{text.enterNewPassword}</p>
          <AuthField label={text.newPassword} type="password" minLength={12} autoComplete="new-password" value={invitation.password} onChange={(value) => change('password', value)} required />
          <AuthField label={text.confirmPassword} type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} required />
        </>}
        {registration && stage === 'credentials' && <>
          <AuthField label={text.email} type="email" value={invitation.email} onChange={(value) => change('email', value)} required />
          {adminRegistration && <AuthField label={text.code} inputMode="numeric" maxLength={8} value={code} onChange={setCode} required />}
          {adminRegistration && <button type="button" disabled={busy} onClick={() => void resendAdminRegistrationCode()} className="text-sm font-semibold text-teal-700 disabled:opacity-50">{text.resend}</button>}
          {!adminRegistration && <AuthField label={text.language} as="select" value={language} onChange={(value) => setLanguage(value as 'fr' | 'en' | 'ar')} options={[['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']]} />}
        </>}
        {registration && stage === 'code' && <>
          <AuthField label={text.code} inputMode="numeric" maxLength={adminRegistration ? 8 : 6} value={code} onChange={setCode} required />
          <p className="text-xs text-slate-500">{text.wrongCode}</p>
          {!adminRegistration && <button type="button" onClick={() => void requestClientCode().catch(setError)} className="text-sm font-semibold text-teal-700">{text.resend}</button>}
        </>}
        {registration && stage === 'details' && <>
          <p className="text-sm text-emerald-800">{invitation.email}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label={text.firstName} value={invitation.firstName} onChange={(value) => change('firstName', value)} required />
            <AuthField label={text.lastName} value={invitation.lastName} onChange={(value) => change('lastName', value)} required />
          </div>
          {registrationRole && <>
            <AuthField label={text.legalName} value={invitation.legalName} onChange={(value) => change('legalName', value)} required />
            <AuthField label={text.country} value={invitation.country} onChange={(value) => change('country', value)} required />
            <AuthField label={text.address} value={invitation.address} onChange={(value) => change('address', value)} required />
            <AuthField label={text.registrationNumber} value={invitation.registrationNumber} onChange={(value) => change('registrationNumber', value)} required />
            {registrationRole === 'SELLER' && <AuthField label={text.pharmaceuticalLicense} value={invitation.pharmaceuticalLicense} onChange={(value) => change('pharmaceuticalLicense', value)} required />}
          </>}
          <AuthField label={text.password} type="password" minLength={12} value={invitation.password} onChange={(value) => change('password', value)} required />
          {adminRegistration && <AuthField label={text.language} as="select" value={language} onChange={(value) => setLanguage(value as 'fr' | 'en' | 'ar')} options={[['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']]} />}
        </>}
        {isLogin && stage === 'credentials' && <>
          <AuthField label={text.email} type="email" autoComplete="email" value={invitation.email} onChange={(value) => change('email', value)} required />
          <AuthField label={text.password} type="password" autoComplete="current-password" value={invitation.password} onChange={(value) => change('password', value)} required />
          {!isAdmin && unverifiedEmail && <button type="button" onClick={() => void resendUnverifiedCode()} className="text-sm font-semibold text-teal-700">{text.resend}</button>}
          <button type="button" onClick={() => {
            setStage('forgot-email');
            setError('');
            setInfo('');
          }} className="text-sm font-semibold text-teal-700 hover:underline">{text.forgotPassword}</button>
        </>}
        {isLogin && stage === 'code' && isAdmin && <>
          <AuthField label={text.code} inputMode="numeric" maxLength={8} value={code} onChange={setCode} required />
          <p className="text-xs text-slate-500">{text.adminWrongCode}</p>
          <button type="button" onClick={() => void adminLogin(invitation.email, invitation.password).then(setInfo).catch(setError)} className="text-sm font-semibold text-teal-700">{text.resend}</button>
        </>}
        {isLogin && stage === 'code' && !isAdmin && unverifiedEmail && <>
          <AuthField label={text.code} inputMode="numeric" maxLength={6} value={code} onChange={setCode} required />
          <button type="button" onClick={() => void resendUnverifiedCode()} className="text-sm font-semibold text-teal-700">{text.resend}</button>
        </>}
        <SubmitButton busy={busy} label={
          isLogin && stage === 'forgot-email' ? text.sendCode
            : isLogin && stage === 'forgot-code' ? text.verify
              : isLogin && stage === 'forgot-password' ? text.submit
                : registration
            ? stage === 'details' ? text.submit : adminRegistration ? text.verify : stage === 'code' ? text.verify : text.sendCode
            : isAdmin && stage === 'code' ? text.verify : text.loginButton
        } />
      </form>
    )}

    {isLogin && stage !== 'forgot-email' && stage !== 'forgot-code' && stage !== 'forgot-password' && <p className="mt-6 text-center text-sm text-slate-600">
      {text.noAccount} <Link className="font-semibold text-teal-700 hover:underline" to="/register">{text.createAccount}</Link>
    </p>}
    {isLogin && ['forgot-email', 'forgot-code', 'forgot-password'].includes(stage) && <button
      type="button"
      onClick={() => {
        setStage('credentials');
        setError(null);
        setInfo('');
        setCode('');
        setConfirmPassword('');
      }}
      className="mt-6 block w-full text-center text-sm font-semibold text-teal-700 hover:underline"
    >{text.backToLogin}</button>}
    {registration && <p className="mt-6 text-center text-sm text-slate-600">
      {text.haveAccount} <Link className="font-semibold text-teal-700 hover:underline" to="/login">{text.signIn}</Link>
    </p>}
    {isAdmin && isLogin && <Link to="/admin/register" className="mt-4 block text-center text-sm font-semibold text-teal-700">{text.adminInvite}</Link>}
    {mode === 'admin-register' && <p className="mt-4 text-xs text-slate-500">{text.pendingAdmin}</p>}
  </AuthShell>;
}

function AuthShell({ children, language, setLanguage, title, description }: {
  children: React.ReactNode;
  language: 'fr' | 'en' | 'ar';
  setLanguage: (language: 'fr' | 'en' | 'ar') => void;
  title: string;
  description: string;
}) {
  const text = translations[language];
  return <main dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowLeft size={16} /> {text.back}</Link>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700"><ShieldCheck size={22} /></div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <select aria-label={text.language} value={language} onChange={(event) => setLanguage(event.target.value as 'fr' | 'en' | 'ar')} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="fr">FR</option><option value="en">EN</option><option value="ar">AR</option>
          </select>
        </div>
        {children}
      </div>
    </div>
  </main>;
}

function AuthField({ label, value, onChange, as, options, ...props }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  as?: 'select';
  options?: [string, string][];
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  if (as === 'select') {
    return <label className="block space-y-1.5 text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
      {options?.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
    </select></label>;
  }
  return <label className="block space-y-1.5 text-sm font-medium">{label}<input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" /></label>;
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
    {busy && <LoaderCircle size={17} className="animate-spin" />}{label}
  </button>;
}
