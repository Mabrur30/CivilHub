import { type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ClientDashboardLayout } from "./components/dashboard/ClientDashboardLayout";
import { ClientBidsPage } from "./pages/ClientBidsPage";
import { ClientOverviewPage } from "./pages/ClientOverviewPage";
import { ClientProjectsPage } from "./pages/ClientProjectsPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignupPage, SignupRoute } from "./pages/SignupPage";
import { EngineerDashboardLayout } from "./components/dashboard/EngineerDashboardLayout";
import { EngineerMarketplacePage } from "./pages/EngineerMarketplacePage";
import { MarketplaceBriefPage } from "./pages/MarketplaceBriefPage";
import { PostPage } from "./pages/PostPage";
import { EngineerBidsPage } from "./pages/EngineerBidsPage";
import { EngineerOverviewPage } from "./pages/EngineerOverviewPage";
import { EngineerProjectsPage } from "./pages/EngineerProjectsPage";
import { EngineerNetworkPage } from "./pages/EngineerNetworkPage";
import { ClientBrowseEngineersPage } from "./pages/ClientBrowseEngineersPage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { ProjectProgressPage } from "./pages/ProjectProgressPage";
import { PostProjectPage } from "./pages/PostProjectPage";
import { InboxPage } from "./pages/InboxPage";
import { PaymentResultPage } from "./pages/PaymentResultPage";
import { RoleDashboardLayout } from "./components/dashboard/RoleDashboardLayout";
import { SearchEngineersPage } from "./pages/SearchEngineersPage";
import { FeedPage } from "./pages/FeedPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProjectHistoryPage } from "./pages/ProjectHistoryPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { CostEstimatorPage } from "./pages/CostEstimatorPage";
import { BrowseEquipmentPage } from "./pages/BrowseEquipmentPage";
import { MyEquipmentPage } from "./pages/MyEquipmentPage";
import { EquipmentDetailPage } from "./pages/EquipmentDetailPage";
import { MyEquipmentBookingsPage } from "./pages/MyEquipmentBookingsPage";
import { BookingDetailPage } from "./pages/BookingDetailPage";
import { useAuth } from "./context/AuthContext";
import { canTakeProjects, dashboardBase } from "./lib/dashboardPaths";

function CostEstimatorRedirect(): ReactElement {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-void text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Checking session...
        </p>
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Navigate
      to={`${dashboardBase(currentUser.role)}/cost-estimator`}
      replace
    />
  );
}

/** Project pages for someone who doesn't take on projects go to Equipment. */
function RequireProjects({
  children,
}: {
  children: ReactElement;
}): ReactElement {
  const { currentUser } = useAuth();
  return canTakeProjects(currentUser) ? (
    children
  ) : (
    <Navigate to={`${dashboardBase(currentUser?.role)}/equipment`} replace />
  );
}

/** A company that only rents out equipment starts on its listings. */
function ProviderHome(): ReactElement {
  const { currentUser } = useAuth();
  return (
    <Navigate
      to={canTakeProjects(currentUser) ? "overview" : "equipment/mine"}
      replace
    />
  );
}

/** Pages shared by the engineer and company dashboards. */
const providerRoutes = (): ReactElement => (
  <>
    <Route index element={<ProviderHome />} />
    <Route
      path="overview"
      element={
        <RequireProjects>
          <EngineerOverviewPage />
        </RequireProjects>
      }
    />
    <Route
      path="projects"
      element={
        <RequireProjects>
          <EngineerProjectsPage />
        </RequireProjects>
      }
    />
    <Route
      path="projects/:projectId"
      element={
        <RequireProjects>
          <ProjectProgressPage />
        </RequireProjects>
      }
    />
    <Route
      path="history"
      element={
        <RequireProjects>
          <ProjectHistoryPage />
        </RequireProjects>
      }
    />
    <Route
      path="marketplace"
      element={
        <RequireProjects>
          <EngineerMarketplacePage />
        </RequireProjects>
      }
    />
    <Route
      path="marketplace/:projectId"
      element={
        <RequireProjects>
          <MarketplaceBriefPage />
        </RequireProjects>
      }
    />
    <Route
      path="bids"
      element={
        <RequireProjects>
          <EngineerBidsPage />
        </RequireProjects>
      }
    />
    <Route path="equipment" element={<Navigate to="browse" replace />} />
    <Route path="equipment/browse" element={<BrowseEquipmentPage />} />
    <Route path="equipment/mine" element={<MyEquipmentPage />} />
    <Route path="equipment/bookings" element={<MyEquipmentBookingsPage />} />
    <Route
      path="equipment/bookings/:bookingId"
      element={<BookingDetailPage />}
    />
    <Route path="equipment/:equipmentId" element={<EquipmentDetailPage />} />
    <Route
      path="cost-estimator"
      element={
        <RequireProjects>
          <CostEstimatorPage />
        </RequireProjects>
      }
    />
    <Route path="network" element={<EngineerNetworkPage />} />
  </>
);

function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup/client" element={<SignupPage role="client" />} />
      <Route path="/signup/engineer" element={<SignupPage role="engineer" />} />
      <Route
        path="/signup/company"
        element={<SignupPage role="organisation" />}
      />
      <Route path="/signup/:role" element={<SignupRoute />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route
        path="/dashboard/engineer"
        element={
          <ProtectedRoute allowedRole="engineer">
            <EngineerDashboardLayout />
          </ProtectedRoute>
        }
      >
        {providerRoutes()}
      </Route>
      {/* Companies share the provider dashboard; tabs follow their services. */}
      <Route
        path="/dashboard/organisation"
        element={
          <ProtectedRoute allowedRole="organisation">
            <EngineerDashboardLayout />
          </ProtectedRoute>
        }
      >
        {providerRoutes()}
      </Route>
      <Route
        path="/dashboard/client"
        element={
          <ProtectedRoute allowedRole="client">
            <ClientDashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<ClientOverviewPage />} />
        <Route path="projects" element={<ClientProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectProgressPage />} />
        <Route path="history" element={<ProjectHistoryPage />} />
        <Route path="post-project" element={<PostProjectPage />} />
        <Route path="cost-estimator" element={<CostEstimatorPage />} />
        <Route path="bids" element={<ClientBidsPage />} />
        <Route path="network" element={<ClientBrowseEngineersPage />} />
        {/* Homeowners rent equipment too; listing it stays with engineers. */}
        <Route
          path="equipment"
          element={<Navigate to="/dashboard/client/equipment/browse" replace />}
        />
        <Route path="equipment/browse" element={<BrowseEquipmentPage />} />
        <Route
          path="equipment/bookings"
          element={<MyEquipmentBookingsPage />}
        />
        <Route
          path="equipment/bookings/:bookingId"
          element={<BookingDetailPage />}
        />
        <Route
          path="equipment/:equipmentId"
          element={<EquipmentDetailPage />}
        />
      </Route>
      <Route path="/cost-estimator" element={<CostEstimatorRedirect />} />
      <Route
        path="/search/engineers"
        element={
          <ProtectedRoute>
            <SearchEngineersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/feed"
        element={
          <ProtectedRoute>
            <FeedPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <RoleDashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Pages every role reaches keep the same header and tabs. */}
        <Route path="/profile/:userId" element={<PublicProfilePage />} />
        <Route path="/users/:userId" element={<PublicProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/posts/:postId" element={<PostPage />} />
        <Route path="/messages" element={<InboxPage />} />
        <Route path="/messages/:targetId" element={<InboxPage />} />
        {/* SSLCommerz sends payers back here after checkout. */}
        <Route path="/payments/result" element={<PaymentResultPage />} />
        <Route path="/settings" element={<AccountSettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
