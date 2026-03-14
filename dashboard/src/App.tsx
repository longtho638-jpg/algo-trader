import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from './components/layout-shell';
import { DashboardPage } from './pages/dashboard-page';
import { BacktestsPage } from './pages/backtests-page';
import { MarketplacePage } from './pages/marketplace-page';
import { SettingsPage } from './pages/settings-page';
import { ReportingPage } from './pages/reporting-page';
import { LicensePage } from './pages/license-page';
import { LandingPage } from './pages/landing-page';
import { PricingPage } from './pages/pricing-page';
import { LoginPage } from './pages/login-page';
import { SignupPage } from './pages/signup-page';

export function App() {
  return (
    <Routes>
      {/* Public routes - full page, no sidebar */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* App routes - sidebar layout */}
      <Route path="/app" element={<LayoutShell><DashboardPage /></LayoutShell>} />
      <Route path="/app/strategies" element={<LayoutShell><MarketplacePage /></LayoutShell>} />
      <Route path="/app/backtests" element={<LayoutShell><BacktestsPage /></LayoutShell>} />
      <Route path="/app/licenses" element={<LayoutShell><LicensePage /></LayoutShell>} />
      <Route path="/app/reporting" element={<LayoutShell><ReportingPage /></LayoutShell>} />
      <Route path="/app/settings" element={<LayoutShell><SettingsPage /></LayoutShell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
