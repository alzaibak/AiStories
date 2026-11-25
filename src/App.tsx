import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { StoryAuthProvider } from '@/contexts/StoryAuthContext';
import { SiteThemeProvider } from '@/contexts/SiteThemeContext';
import { ScrollToTop } from '@/components/ScrollToTop';
import DesignSystemPage from '@/pages/DesignSystemPage';
import NotFound from '@/pages/NotFound';
import ProfilePage, { ReturnTrackingPage } from '@/pages/stories/ProfilePage';
import {
  BookDetailPage,
  CartPage,
  BooksPage,
  CollectionDetailPage,
  CheckoutResultPage,
  OrderThankYouPage,
  DonationsPage,
  DonationCampaignPage,
  EventsPage,
  LandingPage,
  MembershipPage,
  PolicyPage,
  PricingPage,
  ReturnsPolicyRoute,
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
      <SiteThemeProvider>
        <StoryAuthProvider>
        <ScrollToTop />
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
            <Route path="cart" element={<CartPage />} />
            <Route path="donations" element={<DonationsPage />} />
            <Route path="donate" element={<DonationsPage />} />
            <Route path="donation-campaigns/:slug" element={<DonationCampaignPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="livres/:slug" element={<BookDetailPage />} />
            <Route path="books/:slug" element={<BookDetailPage />} />
            <Route path="login" element={<ReaderAuthPage key="login" mode="login" />} />
            <Route path="register" element={<ReaderAuthPage key="register" mode="register" />} />
            <Route path="story-request" element={<StoryRequestPage />} />
            <Route path="story-requests" element={<StoryRequestPage />} />
            <Route path="account" element={<ProfilePage />} />
            <Route path="membership" element={<MembershipPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="checkout/result" element={<CheckoutResultPage />} />
            <Route path="orders/:id/thank-you" element={<OrderThankYouPage />} />
            <Route path="policy" element={<PolicyPage kind="overview" />} />
            <Route path="policy/sources" element={<PolicyPage kind="sources" />} />
            <Route path="policy/depiction" element={<PolicyPage kind="depiction" />} />
            <Route path="policy/returns" element={<ReturnsPolicyRoute />} />
            <Route path="account/returns/:returnId" element={<ReturnTrackingPage />} />
            <Route path="design" element={<DesignSystemPage />} />
            <Route path="workspace" element={<Navigate to="../account" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<LegacyRouteRedirect />} />
        </Routes>
        </StoryAuthProvider>
      </SiteThemeProvider>
    </BrowserRouter>
  );
}
