export type AuthLanguage = 'fr' | 'en' | 'ar';

const messages: Record<AuthLanguage, {
  emailAlreadyUsed: string;
  unverifiedEmail: string;
  tooManyAttempts: string;
  resendWait: string;
  invalidCode: string;
  invalidCredentials: string;
  slowRequest: string;
  generic: string;
  passwordMismatch: string;
  emailServiceUnavailable: string;
}> = {
  fr: {
    emailAlreadyUsed: 'Cette adresse e-mail est déjà associée à un compte. Connectez-vous ou utilisez une autre adresse.',
    unverifiedEmail: 'Votre adresse e-mail n’est pas vérifiée. Renvoyez le code pour continuer.',
    tooManyAttempts: 'Trop de tentatives. Demandez un nouveau code et réessayez.',
    resendWait: 'Veuillez patienter avant de demander un nouveau code.',
    invalidCode: 'Le code est incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.',
    invalidCredentials: 'Adresse e-mail ou mot de passe incorrect. Vérifiez vos identifiants et réessayez.',
    slowRequest: 'La demande prend plus de temps que prévu. Vérifiez votre connexion et réessayez.',
    generic: 'Une erreur est survenue. Réessayez dans un instant.',
    passwordMismatch: 'Les deux mots de passe ne correspondent pas.',
    emailServiceUnavailable: 'L’envoi des e-mails est temporairement indisponible. Réessayez plus tard ou contactez l’administrateur.'
  },
  en: {
    emailAlreadyUsed: 'This email address is already linked to an account. Sign in or use another address.',
    unverifiedEmail: 'Your email address is not verified. Resend the code to continue.',
    tooManyAttempts: 'Too many attempts. Request a new code and try again.',
    resendWait: 'Please wait before requesting another code.',
    invalidCode: 'The code is incorrect or expired. Check it or request a new one.',
    invalidCredentials: 'Incorrect email address or password. Check your credentials and try again.',
    slowRequest: 'The request is taking longer than expected. Check your connection and try again.',
    generic: 'Something went wrong. Please try again shortly.',
    passwordMismatch: 'The passwords do not match.',
    emailServiceUnavailable: 'Email delivery is temporarily unavailable. Please try again later or contact the administrator.'
  },
  ar: {
    emailAlreadyUsed: 'عنوان البريد هذا مرتبط بحساب بالفعل. سجّل الدخول أو استخدم عنواناً آخر.',
    unverifiedEmail: 'لم يتم التحقق من بريدك الإلكتروني. أعد إرسال الرمز للمتابعة.',
    tooManyAttempts: 'محاولات كثيرة. اطلب رمزاً جديداً ثم حاول مرة أخرى.',
    resendWait: 'يرجى الانتظار قبل طلب رمز جديد.',
    invalidCode: 'الرمز غير صحيح أو منتهي الصلاحية. تحقق منه أو اطلب رمزاً جديداً.',
    invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من بياناتك وحاول مجدداً.',
    slowRequest: 'يستغرق الطلب وقتاً أطول من المتوقع. تحقق من اتصالك وحاول مجدداً.',
    generic: 'حدث خطأ. يرجى المحاولة بعد قليل.',
    passwordMismatch: 'كلمتا المرور غير متطابقتين.',
    emailServiceUnavailable: 'إرسال البريد الإلكتروني غير متاح مؤقتاً. حاول لاحقاً أو تواصل مع المسؤول.'
  }
};

export function localizeAuthError(error: unknown, language: AuthLanguage): string {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof error === 'string' ? error.toLowerCase() : '';
  const text = messages[language];
  if (error && typeof error === 'object' && 'code' in error &&
    error.code === 'EMAIL_SERVICE_UNAVAILABLE') return text.emailServiceUnavailable;
  if (/خدمة البريد|email service.*not configured|email delivery.*unavailable|service e-mail n’est pas configuré|service e-mail est temporairement indisponible/.test(message)) {
    return text.emailServiceUnavailable;
  }

  if (/déjà utilisée|déjà associée|already linked|already used|already exists/.test(message)) return text.emailAlreadyUsed;
  if (/adresse e-mail n’est pas vérifiée|email address is not verified/.test(message)) return text.unverifiedEmail;
  if (/nombre maximal|max attempts|too many attempts|tentatives atteintes/.test(message)) return text.tooManyAttempts;
  if (/veuillez patienter|please wait|429|trop de demandes|too many requests/.test(message)) return text.resendWait;
  if (/code incorrect|code invalide|code.*expir|code.*ne correspond|code.*été utilisé|invalid or expired|wrong code|code.*does not match|code.*already used/.test(message)) return text.invalidCode;
  if (/identifiants invalides|incorrect email|invalid credentials/.test(message)) return text.invalidCredentials;
  if (/mots de passe ne correspondent|passwords do not match|كلمتا المرور غير متطابقتين/.test(message)) return text.passwordMismatch;
  if (/plus de temps|serveur ne répond|failed to fetch|networkerror|network error|fetch failed|timeout/.test(message)) return text.slowRequest;
  return text.generic;
}
