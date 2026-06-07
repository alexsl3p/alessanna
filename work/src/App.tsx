import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./context/AuthContext";
import { EffectiveRoleProvider, useEffectiveRole } from "./context/EffectiveRoleContext";
import { isWorkerOnlyView } from "./lib/roles";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { BookingsPage } from "./pages/BookingsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AdminStaffPage } from "./pages/AdminStaffPage";
import { AdminSchedulePage } from "./pages/AdminSchedulePage";
import { AdminTimeOffPage } from "./pages/AdminTimeOffPage";
import { AdminSupportPage } from "./pages/AdminSupportPage";
import { AdminInventoryPage } from "./pages/AdminInventoryPage";
import { AdminCommunicationsPage } from "./pages/AdminCommunicationsPage";
import { AdminSiteSettingsPage } from "./pages/AdminSiteSettingsPage";
import { MyHelpPage } from "./pages/MyHelpPage";
import { ProfileSecurityPage } from "./pages/ProfileSecurityPage";
import { PublicBookingPage } from "./pages/PublicBookingPage";
import { SimplePublicBookingPage } from "./pages/SimplePublicBookingPage";
import { ReceptionPage } from "./pages/ReceptionPage";
import { PublicInvitePage } from "./pages/PublicInvitePage";
import { AdminInvitesPage } from "./pages/AdminInvitesPage";
import { PwaResetPasswordPage } from "./pages/PwaResetPasswordPage";
import { ClientsPage } from "./pages/ClientsPage";
import { InstallPage } from "./pages/InstallPage";
import { SetupGuidePage } from "./pages/SetupGuidePage";

function RequireManage({ children }: { children: React.ReactNode }) {
  const { canManage } = useEffectiveRole();
  if (!canManage) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { staffMember, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        {t("common.loading")}
      </div>
    );
  }
  if (!staffMember) {
    const next = location.pathname !== "/" ? `?next=${encodeURIComponent(location.pathname)}` : "";
    return <Navigate to={`/login${next}`} replace />;
  }
  if (isWorkerOnlyView(staffMember.roles) && location.pathname !== "/reception" && location.pathname !== "/quick-booking") {
    return <Navigate to="/reception" replace />;
  }
  return <EffectiveRoleProvider>{children}</EffectiveRoleProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/install" element={<InstallPage />} />
      <Route path="/setupguide" element={<SetupGuidePage />} />
      <Route path="/help" element={<MyHelpPage />} />
      <Route path="/book" element={<PublicBookingPage />} />
      <Route path="/book/simple" element={<SimplePublicBookingPage />} />
      <Route path="/reception" element={<Protected><ReceptionPage /></Protected>} />
      <Route path="/quick-booking" element={<Protected><ReceptionPage /></Protected>} />
      <Route path="/invite/:token" element={<PublicInvitePage />} />
      <Route path="/auth/reset-password" element={<PwaResetPasswordPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route
          path="clients"
          element={
            <RequireManage>
              <ClientsPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/staff"
          element={
            <RequireManage>
              <AdminStaffPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/services"
          element={
            <RequireManage>
              <ServicesPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/schedule"
          element={
            <RequireManage>
              <AdminSchedulePage />
            </RequireManage>
          }
        />
        <Route
          path="admin/time-off"
          element={
            <RequireManage>
              <AdminTimeOffPage />
            </RequireManage>
          }
        />
        <Route
          path="analytics"
          element={
            <RequireManage>
              <AnalyticsPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/support"
          element={
            <RequireManage>
              <AdminSupportPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/site-settings"
          element={
            <RequireManage>
              <AdminSiteSettingsPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/inventory"
          element={
            <RequireManage>
              <AdminInventoryPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/communications"
          element={
            <RequireManage>
              <AdminCommunicationsPage />
            </RequireManage>
          }
        />
        <Route
          path="admin/invites"
          element={
            <RequireManage>
              <AdminInvitesPage />
            </RequireManage>
          }
        />
        <Route path="profile/security" element={<ProfileSecurityPage />} />
        <Route path="services" element={<Navigate to="/admin/services" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
