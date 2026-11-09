import { Navigate, Route, Routes } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import { dashboardForRole, TenderAuthProvider, useTenderAuth } from '@/contexts/TenderAuthContext';
import type { UserRole } from '@/lib/tenderApi';
import AuthPage from '@/pages/tendering/AuthPage';
import LandingPage from '@/pages/tendering/LandingPage';
import WorkspacePage from '@/pages/tendering/WorkspacePage';
import NotFound, { StatusPage } from '@/pages/NotFound';

function ProtectedWorkspace({ role }: { role?: UserRole }) {
  const { user, isLoading } = useTenderAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Chargement de votre espace…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const userRole = user.role === 'SUPER_ADMIN' ? 'ADMIN' : user.role;
  if (role && userRole !== role) return <Navigate to={dashboardForRole(user.role)} replace />;
  if (!role) return <Navigate to={dashboardForRole(user.role)} replace />;
  return <WorkspacePage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <TenderAuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/register/buyer" element={<AuthPage mode="register" role="BUYER" />} />
          <Route path="/register/seller" element={<AuthPage mode="register" role="SELLER" />} />
          <Route path="/workspace" element={<ProtectedWorkspace />} />
          <Route path="/buyer/login" element={<Navigate to="/login" replace />} />
          <Route path="/seller/login" element={<Navigate to="/login" replace />} />
          <Route path="/buyer/register" element={<Navigate to="/register/buyer" replace />} />
          <Route path="/seller/register" element={<Navigate to="/register/seller" replace />} />
          <Route path="/buyer/*" element={<ProtectedWorkspace role="BUYER" />} />
          <Route path="/seller/*" element={<ProtectedWorkspace role="SELLER" />} />
          <Route path="/admin/login" element={<AuthPage mode="admin-login" />} />
          <Route path="/admin/register" element={<AuthPage mode="admin-register" />} />
          <Route path="/admin/invitations" element={<ProtectedAdminInvitations />} />
          <Route path="/admin/*" element={<ProtectedWorkspace role="ADMIN" />} />
          <Route path="/403" element={<StatusPage code={403} title="Accès refusé" description="Votre rôle ne permet pas d’accéder à cette page." />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TenderAuthProvider>
    </BrowserRouter>
  );
}

function ProtectedAdminInvitations() {
  const { user, isLoading } = useTenderAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Chargement de votre espace…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== 'SUPER_ADMIN') return <Navigate to={dashboardForRole(user.role)} replace />;
  return <AuthPage mode="admin-invite" />;
}
