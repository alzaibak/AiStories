import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { StoryAuthProvider } from '@/contexts/StoryAuthContext';
import NotFound from '@/pages/NotFound';
import AdminContentPage from '@/pages/stories/AdminContentPage';
import { AdminBadgesPage, AdminReviewsPage, AdminStoryRequestsPage } from '@/pages/stories/AdminCommunityPages';
import { AdminQuizEditorPage, AdminQuizzesPage } from '@/pages/stories/AdminQuizPages';
import { AdminMediaLibraryPage, AdminVideosPage } from '@/pages/stories/AdminMediaPages';
import {
  AdminDonationsPage,
  AdminEmailTemplatesPage,
  AdminEventsPage,
  AdminPromoCodesPage,
  AdminPolicyPage,
  AdminTeamsPage
} from '@/pages/stories/AdminOperationsPages';
import AdminLayout from '@/pages/stories/AdminLayout';
import {
  AdminBooksPage,
  AdminCollectionsPage,
  AdminDashboardPage,
  AdminModulePage,
  AdminReviewQueuePage,
  AdminStoriesPage
} from '@/pages/stories/AdminDashboardPages';
import { AdminChangePasswordPage, AdminPasswordResetPage, AdminRegisterPage, AdminUsersPage } from '@/pages/stories/AdminAccountPages';
import {
  AdminLoginPage,
  AdminStoreOrdersPage,
  AdminSubscriptionsPage
} from '@/pages/stories/StoryPlatform';

function AdminLocaleRoutes() {
  const { locale = '' } = useParams();
  const location = useLocation();
  if (!['fr', 'en', 'ar'].includes(locale)) {
    return <Navigate to={`/ar/admin${location.pathname === '/' ? '' : location.pathname}${location.search}`} replace />;
  }
  return <Outlet />;
}

export default function AdminApp() {
  return (
    <BrowserRouter>
      <StoryAuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/ar/admin/login" replace />} />
          <Route path="/:locale" element={<AdminLocaleRoutes />}>
            <Route index element={<Navigate to="admin/login" replace />} />
            <Route path="admin/login" element={<AdminLoginPage />} />
            <Route path="admin/register" element={<AdminRegisterPage />} />
            <Route path="admin/reset-password" element={<AdminPasswordResetPage />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="content" element={<Navigate to="stories" replace />} />
              <Route path="content/collections" element={<AdminCollectionsPage />} />
              <Route path="content/collections/new" element={<AdminContentPage />} />
              <Route path="content/collections/:collectionId/edit" element={<AdminContentPage />} />
              <Route path="content/stories" element={<AdminStoriesPage />} />
              <Route path="content/stories/new" element={<AdminContentPage />} />
              <Route path="content/stories/:storyId/edit" element={<AdminContentPage />} />
              <Route path="content/stories/:storyId/parts/new" element={<AdminContentPage />} />
              <Route path="content/quizzes" element={<AdminQuizzesPage />} />
              <Route path="content/quizzes/new" element={<AdminQuizEditorPage />} />
              <Route path="content/quizzes/:quizId/edit" element={<AdminQuizEditorPage />} />
              <Route path="content/videos" element={<AdminVideosPage />} />
              <Route path="content/media" element={<AdminMediaLibraryPage />} />
              <Route path="content/review-queue" element={<AdminReviewQueuePage />} />
              <Route path="content/requests" element={<AdminStoryRequestsPage />} />
              <Route path="community/badges" element={<AdminBadgesPage />} />
              <Route path="community/reviews" element={<AdminReviewsPage />} />
              <Route path="community/events" element={<AdminEventsPage />} />
              <Route path="community/teams" element={<AdminTeamsPage />} />
              <Route path="shop/books" element={<AdminBooksPage />} />
              <Route path="shop/books/new" element={<AdminContentPage />} />
              <Route path="shop/books/:bookId/edit" element={<AdminContentPage />} />
              <Route path="orders" element={<AdminStoreOrdersPage />} />
              <Route path="money/payments" element={<AdminStoreOrdersPage />} />
              <Route path="money/donations" element={<AdminDonationsPage />} />
              <Route path="money/promo-codes" element={<AdminPromoCodesPage />} />
              <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
              <Route path="system/users" element={<AdminUsersPage />} />
              <Route path="system/change-password" element={<AdminChangePasswordPage />} />
              <Route path="system/emails" element={<AdminEmailTemplatesPage />} />
              <Route path="system/policy" element={<AdminPolicyPage />} />
              <Route path="system" element={<AdminModulePage title="إعدادات النظام" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/ar/admin/login" replace />} />
        </Routes>
      </StoryAuthProvider>
    </BrowserRouter>
  );
}
