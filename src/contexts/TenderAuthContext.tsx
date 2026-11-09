import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type TenderUser, type UserRole } from '@/lib/tenderApi';

type ClientRole = Extract<UserRole, 'BUYER' | 'SELLER'>;

interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  language: 'fr' | 'en' | 'ar';
  legalName: string;
  country: string;
  address: string;
  registrationNumber: string;
  pharmaceuticalLicense?: string;
}

interface AuthContextValue {
  user: TenderUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  adminLogin: (email: string, password: string) => Promise<string>;
  verifyAdminCode: (email: string, code: string) => Promise<void>;
  requestRegistrationCode: (role: ClientRole, email: string, language: 'fr' | 'en' | 'ar') => Promise<string>;
  verifyRegistrationCode: (role: ClientRole, email: string, code: string) => Promise<string>;
  register: (role: ClientRole, data: RegisterInput, verificationToken: string) => Promise<string>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const TenderAuthContext = createContext<AuthContextValue | undefined>(undefined);

export function dashboardForRole(role: UserRole) {
  if (role === 'SELLER') return '/seller/dashboard';
  if (role === 'BUYER') return '/buyer/dashboard';
  return '/admin/dashboard';
}

export function TenderAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TenderUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    const token = localStorage.getItem('tenderingToken');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const response = await api.get<{ user: TenderUser }>('/auth/me');
      setUser(response.user);
      setError(null);
    } catch (caught) {
      localStorage.removeItem('tenderingToken');
      setUser(null);
      setError(caught instanceof Error ? caught.message : 'Impossible de vérifier la session.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<{ user: TenderUser; token: string }>('/auth/login', { email, password });
    localStorage.setItem('tenderingToken', response.token);
    setUser(response.user);
    setError(null);
  };

  const adminLogin = async (email: string, password: string) => {
    const response = await api.post<{ message: string }>('/admin/auth/login', { email, password });
    return response.message;
  };

  const verifyAdminCode = async (email: string, code: string) => {
    const response = await api.post<{ user: TenderUser; token: string }>('/admin/auth/verify-code', { email, code });
    localStorage.setItem('tenderingToken', response.token);
    setUser(response.user);
    setError(null);
  };

  const requestRegistrationCode = async (role: ClientRole, email: string, language: 'fr' | 'en' | 'ar') => {
    const response = await api.post<{ message: string }>(
      `/${role.toLowerCase()}/auth/register/request-code`,
      { email, language }
    );
    return response.message;
  };

  const verifyRegistrationCode = async (role: ClientRole, email: string, code: string) => {
    const response = await api.post<{ verificationToken: string }>(
      `/${role.toLowerCase()}/auth/register/verify-code`,
      { email, code }
    );
    return response.verificationToken;
  };

  const register = async (role: ClientRole, data: RegisterInput, verificationToken: string) => {
    const response = await api.postWithBearer<{ message: string }>(
      `/${role.toLowerCase()}/auth/register`,
      data,
      verificationToken
    );
    return response.message;
  };

  const logout = () => {
    localStorage.removeItem('tenderingToken');
    setUser(null);
    setError(null);
  };

  const value = useMemo(() => ({
    user, isLoading, error, login, adminLogin, verifyAdminCode,
    requestRegistrationCode, verifyRegistrationCode, register, logout, refreshUser
  }), [user, isLoading, error]);
  return <TenderAuthContext.Provider value={value}>{children}</TenderAuthContext.Provider>;
}

export function useTenderAuth() {
  const context = useContext(TenderAuthContext);
  if (!context) throw new Error('useTenderAuth doit être utilisé dans TenderAuthProvider.');
  return context;
}
