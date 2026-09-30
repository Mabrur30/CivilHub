import { type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { ActionLogPage } from "./pages/ActionLogPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PayeePage } from "./pages/PayeePage";
import { DepositDetailPage } from "./pages/DepositDetailPage";
import { DepositsPage } from "./pages/DepositsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ContentPage } from "./pages/ContentPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProjectDisputeDetailPage } from "./pages/ProjectDisputeDetailPage";
import { ProjectDisputesPage } from "./pages/ProjectDisputesPage";
import { VerificationDetailPage } from "./pages/VerificationDetailPage";
import { VerificationsPage } from "./pages/VerificationsPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { RefundsPage } from "./pages/RefundsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UserDetailPage } from "./pages/UserDetailPage";
import { UsersPage } from "./pages/UsersPage";

/** Everything but the sign-in page needs a signed-in admin. */
function RequireAdmin({ children }: { children: ReactElement }): ReactElement {
  const { admin, isChecking } = useAuth();
  const location = useLocation();
  if (isChecking) {
    return <p className="p-10 text-center text-sm text-white/50">Checking your session...</p>;
  }
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAdmin>
            <Layout />
          </RequireAdmin>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserDetailPage />} />
        <Route path="payouts" element={<PayoutsPage />} />
        <Route path="payouts/:userId" element={<PayeePage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="verifications" element={<VerificationsPage />} />
        <Route path="verifications/:userId" element={<VerificationDetailPage />} />
        <Route path="project-disputes" element={<ProjectDisputesPage />} />
        <Route path="project-disputes/:disputeId" element={<ProjectDisputeDetailPage />} />
        <Route path="deposits" element={<DepositsPage />} />
        <Route path="deposits/:bookingId" element={<DepositDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="log" element={<ActionLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
