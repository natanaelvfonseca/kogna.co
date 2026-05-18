import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { RevenueMetrics } from './pages/dashboard/RevenueMetrics';
import { Onboarding } from './pages/onboarding/Onboarding';
import { OnboardingV2 } from './pages/onboarding/OnboardingV2';
import { AppShell } from './components/layout/AppShell';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { WhatsAppConnection } from './pages/settings/WhatsAppConnection';
import { Settings } from './pages/settings/Settings';
import { CRM } from './pages/crm/CRM';
import { LiveChat } from './pages/live-chat/LiveChat';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { OnboardingGuard } from './components/auth/OnboardingGuard';
import { MyAIs } from './pages/brain/MyAIs';
import { Billing } from './pages/billing/Billing';
import { Agenda } from './pages/agenda/Agenda';
import { Vendedores } from './pages/vendedores/Vendedores';
import { SellerProfile } from './pages/vendedores/SellerProfile';
import { PartnerDashboard } from './pages/partners/PartnerDashboard';
import { PartnerRegister } from './pages/partners/PartnerRegister';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminPartners } from './pages/admin/AdminPartners';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminRoute } from './components/auth/AdminRoute';
import { NotificationProvider } from './context/NotificationContext';
import { Clients } from './pages/clients/Clients';
import { Checkout } from './pages/checkout/Checkout';
import { CheckoutSuccess } from './pages/checkout/CheckoutSuccess';
import { FollowupManager } from './pages/recovery/FollowupManager';
import { Products } from './pages/products/Products';

import { AdminIntelligence } from './pages/admin/AdminIntelligence';
import { KognaIntelligencePanel } from './pages/admin/KognaIntelligencePanel';
import { AdminAutomations } from './pages/admin/AdminAutomations';
import { VideoOnboardingMvp } from './pages/admin/VideoOnboardingMvp';

import { ReferralRedirect } from './pages/partners/ReferralRedirect';
import { GuidedTourProvider } from './components/guided-tour/GuidedTourProvider';
import { KognaOfferPage } from './pages/marketing/KognaOfferPage';
import { MetaWhatsappReportOfferPage } from './pages/marketing/MetaWhatsappReportOfferPage';
import {
    CentralMelPage,
    CoursesOffersPage,
    PaymentDataPage,
    SalesTeamPage,
    SchoolAlertsPage,
    SchoolConversationsPage,
    SchoolGoalsPage,
    SchoolLeadsPage,
    SchoolOnboardingPage,
    SchoolPipelinePage,
    SchoolSettingsPage,
    SchoolTasksPage,
} from './pages/schools/KognaSchools';

declare global {
    interface Window {
        fbq?: (...args: unknown[]) => void;
    }
}

function MetaPixelTracker() {
    const location = useLocation();
    const hasTrackedInitialPageView = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.fbq !== 'function') {
            return;
        }

        if (!hasTrackedInitialPageView.current) {
            hasTrackedInitialPageView.current = true;
            return;
        }

        window.fbq('track', 'PageView');
    }, [location.pathname, location.search, location.hash]);

    return null;
}

function App() {
    return (
        <ThemeProvider defaultTheme="light" storageKey="kogna-theme-v2">
            <BrowserRouter>
                <MetaPixelTracker />
                <AuthProvider>
                    <NotificationProvider>
                        <Routes>
                            <Route path="/p/:code" element={<ReferralRedirect />} />
                            <Route path="/oferta" element={<KognaOfferPage />} />
                            <Route path="/v2oferta" element={<MetaWhatsappReportOfferPage />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<OnboardingV2 />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/start" element={<OnboardingV2 />} />
                            <Route path="/partners/register" element={<PartnerRegister />} />

                            {/* Protected Routes */}
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <OnboardingGuard>
                                        <GuidedTourProvider>
                                            <AppShell />
                                        </GuidedTourProvider>
                                    </OnboardingGuard>
                                </ProtectedRoute>
                            }>
                                <Route index element={<Navigate to="/mel" replace />} />
                                <Route path="dashboard" element={<Navigate to="/mel" replace />} />
                                <Route path="mel" element={<CentralMelPage />} />
                                <Route path="school-onboarding" element={<SchoolOnboardingPage />} />
                                <Route path="courses-offers" element={<CoursesOffersPage />} />
                                <Route path="school-payment-data" element={<PaymentDataPage />} />
                                <Route path="sales-team" element={<SalesTeamPage />} />
                                <Route path="school-pipeline" element={<SchoolPipelinePage />} />
                                <Route path="school-leads" element={<SchoolLeadsPage />} />
                                <Route path="school-conversations" element={<SchoolConversationsPage />} />
                                <Route path="school-tasks" element={<SchoolTasksPage />} />
                                <Route path="school-alerts" element={<SchoolAlertsPage />} />
                                <Route path="school-goals" element={<SchoolGoalsPage />} />
                                <Route path="school-settings" element={<SchoolSettingsPage />} />
                                <Route path="dashboard/revenue-metrics" element={<RevenueMetrics />} />
                                <Route path="whatsapp" element={<WhatsAppConnection />} />
                                <Route path="crm" element={<CRM />} />
                                <Route path="clients" element={<Clients />} />
                                <Route path="live-chat" element={<LiveChat />} />
                                <Route path="brain" element={<MyAIs />} />
                                <Route path="settings" element={<Settings />} />
                                <Route path="billing" element={<Billing />} />
                                <Route path="agenda" element={<Agenda />} />
                                <Route path="vendedores" element={<Vendedores />} />
                                <Route path="vendedores/:id" element={<SellerProfile />} />
                                <Route path="recovery" element={<FollowupManager />} />
                                <Route path="products" element={<Products />} />

                                <Route path="partners" element={<PartnerDashboard />} />

                                {/* Admin Routes */}
                                <Route path="admin/dashboard" element={
                                    <AdminRoute>
                                        <AdminDashboard />
                                    </AdminRoute>
                                } />
                                <Route path="admin/partners" element={
                                    <AdminRoute>
                                        <AdminPartners />
                                    </AdminRoute>
                                } />
                                <Route path="admin/products" element={
                                    <AdminRoute>
                                        <AdminProducts />
                                    </AdminRoute>
                                } />
                                <Route path="admin/conversation-intelligence" element={
                                    <AdminRoute>
                                        <AdminIntelligence />
                                    </AdminRoute>
                                } />
                                <Route path="admin/intelligence-panel" element={
                                    <AdminRoute>
                                        <KognaIntelligencePanel />
                                    </AdminRoute>
                                } />
                                <Route path="admin/automations" element={
                                    <AdminRoute>
                                        <AdminAutomations />
                                    </AdminRoute>
                                } />
                                <Route path="admin/video" element={
                                    <AdminRoute>
                                        <VideoOnboardingMvp />
                                    </AdminRoute>
                                } />

                                <Route path="checkout" element={<Checkout />} />
                                <Route path="checkout/success" element={<CheckoutSuccess />} />
                                <Route path="checkout/failure" element={<CheckoutSuccess />} />
                                <Route path="checkout/pending" element={<CheckoutSuccess />} />

                                {/* Add other routes here */}
                                <Route path="*" element={<div className="text-white p-8">Página em construção</div>} />
                            </Route>
                        </Routes>
                    </NotificationProvider>
                </AuthProvider>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
