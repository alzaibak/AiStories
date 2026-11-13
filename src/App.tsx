import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { StoryAuthProvider } from '@/contexts/StoryAuthContext';
import NotFound from '@/pages/NotFound';
import {
  AccountPage,
  BookDetailPage,
  BooksPage,
  CollectionDetailPage,
  CheckoutResultPage,
  DonationsPage,
  EventsPage,
  LandingPage,
  MembershipPage,
  PolicyPage,
  PricingPage,
  ReaderAuthPage,
  ReaderPage,
  StoriesPage,
  StoryDetailPage,
  StoryRequestPage
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
            <Route path="collections/:slug" element={<CollectionDetailPage />} />
            <Route path="histoires/:slug" element={<StoryDetailPage />} />
            <Route path="stories/:slug" element={<StoryDetailPage />} />
            <Route path="histoires/:slug/read/:partNumber" element={<ReaderPage />} />
            <Route path="stories/:slug/read/:partNumber" element={<ReaderPage />} />
            <Route path="books" element={<BooksPage />} />
            <Route path="donations" element={<DonationsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="livres/:slug" element={<BookDetailPage />} />
            <Route path="books/:slug" element={<BookDetailPage />} />
            <Route path="login" element={<ReaderAuthPage key="login" mode="login" />} />
            <Route path="register" element={<ReaderAuthPage key="register" mode="register" />} />
            <Route path="story-request" element={<StoryRequestPage />} />
            <Route path="story-requests" element={<StoryRequestPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="membership" element={<MembershipPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="checkout/result" element={<CheckoutResultPage />} />
            <Route path="policy" element={<PolicyPage kind="overview" />} />
            <Route path="policy/sources" element={<PolicyPage kind="sources" />} />
            <Route path="policy/depiction" element={<PolicyPage kind="depiction" />} />
            <Route path="workspace" element={<Navigate to="../account" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<LegacyRouteRedirect />} />
        </Routes>
      </StoryAuthProvider>
    </BrowserRouter>
  );
}
