import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, clearAuthToken, getAuthToken, setAuthToken, type PlatformUser, type ReaderSubscription } from '@/lib/api';

interface AuthContextValue {
  user: PlatformUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  requestPasswordResetCode: (email: string, language: 'ar' | 'en' | 'fr', accountType: 'reader' | 'admin') => Promise<string>;
  verifyPasswordResetCode: (email: string, code: string, accountType: 'reader' | 'admin') => Promise<string>;
  resetPassword: (email: string, password: string, resetToken: string, accountType: 'reader' | 'admin') => Promise<string>;
  adminLogin: (email: string, password: string) => Promise<string>;
  verifyAdminCode: (email: string, code: string) => Promise<void>;
  requestReaderRegistrationCode: (email: string, language: 'ar' | 'en' | 'fr') => Promise<string>;
  verifyReaderRegistrationCode: (email: string, code: string) => Promise<string>;
  registerReader: (data: { firstName: string; lastName: string; email: string; password: string; language: 'ar' | 'en' | 'fr' }, verificationToken: string) => Promise<string>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const StoryAuthContext = createContext<AuthContextValue | undefined>(undefined);

export function StoryAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const response = await api.get<{ user: PlatformUser; subscriptions?: ReaderSubscription[] }>('/auth/me');
      setUser({ ...response.user, subscriptions: response.subscriptions || [] });
      setError(null);
    } catch (caught) {
      clearAuthToken();
      setUser(null);
      setError(caught instanceof Error ? caught.message : 'Impossible de vérifier la session.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      clearAuthToken();
      setUser(null);
      setError(null);
      setIsLoading(false);
      const language = location.pathname.match(/^\/(ar|en|fr)(?:\/|$)/)?.[1] || 'ar';
      const isAdminApp = import.meta.env.VITE_APP_TARGET === 'admin';
      navigate(`/${language}/${isAdminApp ? 'admin/login' : 'login'}`, { replace: true });
    };
    window.addEventListener('story-auth:expired', handleExpiredSession);
    return () => window.removeEventListener('story-auth:expired', handleExpiredSession);
  }, [location.pathname, navigate]);

  const login = async (email: string, password: string) => {
    const response = await api.post<{ user: PlatformUser; token: string }>('/auth/login', { email, password });
    setAuthToken(response.token);
    setUser(response.user);
    setError(null);
    await refreshUser();
  };

  const requestPasswordResetCode = async (
    email: string,
    language: 'ar' | 'en' | 'fr',
    accountType: 'reader' | 'admin'
  ) => {
    const response = await api.post<{ message: string }>('/auth/password/request-code', { email, language, accountType });
    return response.message;
  };

  const verifyPasswordResetCode = async (email: string, code: string, accountType: 'reader' | 'admin') => {
    const response = await api.post<{ resetToken: string }>(
      '/auth/password/verify-code',
      { email, code, accountType }
    );
    return response.resetToken;
  };

  const resetPassword = async (
    email: string,
    password: string,
    resetToken: string,
    accountType: 'reader' | 'admin'
  ) => {
    const response = await api.postWithBearer<{ message: string }>(
      '/auth/password/reset',
      { email, password, accountType },
      resetToken
    );
    return response.message;
  };

  const adminLogin = async (email: string, password: string) => {
    const response = await api.post<{ message: string }>('/admin/auth/login', { email, password });
    return response.message;
  };

  const verifyAdminCode = async (email: string, code: string) => {
    const response = await api.post<{ user: PlatformUser; token: string }>('/admin/auth/verify-code', { email, code });
    setAuthToken(response.token);
    setUser(response.user);
    setError(null);
    await refreshUser();
  };

  const requestReaderRegistrationCode = async (email: string, language: 'ar' | 'en' | 'fr') => {
    const response = await api.post<{ message: string }>('/reader/auth/register/request-code', { email, language });
    return response.message;
  };

  const verifyReaderRegistrationCode = async (email: string, code: string) => {
    const response = await api.post<{ verificationToken: string }>('/reader/auth/register/verify-code', { email, code });
    return response.verificationToken;
  };

  const registerReader = async (
    data: { firstName: string; lastName: string; email: string; password: string; language: 'ar' | 'en' | 'fr' },
    verificationToken: string
  ) => {
    const response = await api.postWithBearer<{ message: string }>('/reader/auth/register', data, verificationToken);
    return response.message;
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    setError(null);
  };

  return <StoryAuthContext.Provider value={{
    user, isLoading, error, login, requestPasswordResetCode, verifyPasswordResetCode, resetPassword,
    adminLogin, verifyAdminCode,
    requestReaderRegistrationCode, verifyReaderRegistrationCode, registerReader,
    logout, refreshUser
  }}>{children}</StoryAuthContext.Provider>;
}

export function useStoryAuth() {
  const context = useContext(StoryAuthContext);
  if (!context) throw new Error('useStoryAuth doit être utilisé dans StoryAuthProvider.');
  return context;
}
