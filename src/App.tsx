import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Onboarding } from './pages/onboarding/Onboarding';
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

function App() {
    return (
        <ThemeProvider defaultTheme="light" storageKey="kogna-theme-v2">
            <BrowserRouter>
                <AuthProvider>
                    <NotificationProvider>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/partners/register" element={<PartnerRegister />} />

                            {/* Protected Routes */}
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <OnboardingGuard>
                                        <AppShell />
                                    </OnboardingGuard>
                                </ProtectedRoute>
                            }>
                                <Route index element={<Navigate to="/dashboard" replace />} />
                                <Route path="dashboard" element={<Dashboard />} />
                                <Route path="whatsapp" element={<WhatsAppConnection />} />
                                <Route path="crm" element={<CRM />} />
                                <Route path="clients" element={<Clients />} />
                                <Route path="live-chat" element={<LiveChat />} />
                                <Route path="brain" element={<MyAIs />} />
                                <Route path="settings" element={<Settings />} />
                                <Route path="billing" element={<Billing />} />
                                <Route path="agenda" element={<Agenda />} />
                                <Route path="recovery" element={<FollowupManager />} />
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
