import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { StoryAuthProvider } from '@/contexts/StoryAuthContext';
import NotFound from '@/pages/NotFound';
import AdminContentPage from '@/pages/stories/AdminContentPage';
import AdminLayout from '@/pages/stories/AdminLayout';
import {
  AdminCollectionsPage,
  AdminBooksPage,
  AdminDashboardPage,
  AdminModulePage,
  AdminReviewQueuePage,
  AdminStoriesPage
} from '@/pages/stories/AdminDashboardPages';
import {
  AccountPage,
  AdminLoginPage,
  AdminStoreOrdersPage,
  AdminSubscriptionsPage,
  BookDetailPage,
  BooksPage,
  CheckoutResultPage,
  LandingPage,
  MembershipPage,
  PolicyPage,
  PricingPage,
  ReaderAuthPage,
  ReaderPage,
  StoriesPage,
  StoryDetailPage
} from '@/pages/stories/StoryPlatform';

function LocalizedRoutes() {
  const { locale = '' } = useParams();
  const location = useLocation();
  if (!['fr', 'en', 'ar'].includes(locale)) {
    return <Navigate to={`/ar${location.pathname}${location.search}${location.hash}`} replace />;
  }
  return <Outlet />;
}

function LegacyRouteRedirect() {
  const location = useLocation();
  return <Navigate to={`/ar${location.pathname === '/' ? '' : location.pathname}${location.search}${location.hash}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <StoryAuthProvider>
        <Routes>
          <Route path="/:locale" element={<LocalizedRoutes />}>
            <Route index element={<LandingPage />} />
            <Route path="stories" element={<StoriesPage />} />
            <Route path="stories/:slug" element={<StoryDetailPage />} />
            <Route path="stories/:slug/read/:partNumber" element={<ReaderPage />} />
            <Route path="books" element={<BooksPage />} />
            <Route path="books/:slug" element={<BookDetailPage />} />
            <Route path="login" element={<ReaderAuthPage key="login" mode="login" />} />
            <Route path="register" element={<ReaderAuthPage key="register" mode="register" />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="membership" element={<MembershipPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="checkout/result" element={<CheckoutResultPage />} />
            <Route path="policy" element={<PolicyPage kind="overview" />} />
            <Route path="policy/sources" element={<PolicyPage kind="sources" />} />
            <Route path="policy/depiction" element={<PolicyPage kind="depiction" />} />
            <Route path="workspace" element={<Navigate to="../account" replace />} />
            <Route path="admin/login" element={<AdminLoginPage />} />
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
              <Route path="content/review-queue" element={<AdminReviewQueuePage />} />
              <Route path="shop/books" element={<AdminBooksPage />} />
              <Route path="shop/books/new" element={<AdminContentPage />} />
              <Route path="shop/books/:bookId/edit" element={<AdminContentPage />} />
              <Route path="orders" element={<AdminStoreOrdersPage />} />
              <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
              <Route path="system" element={<AdminModulePage title="إعدادات النظام" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<LegacyRouteRedirect />} />
        </Routes>
      </StoryAuthProvider>
    </BrowserRouter>
  );
}
