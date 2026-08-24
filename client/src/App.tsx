import { type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ClientDashboardLayout } from "./components/dashboard/ClientDashboardLayout";
import { ClientBidsPage } from "./pages/ClientBidsPage";
import { ClientOverviewPage } from "./pages/ClientOverviewPage";
import { ClientProfilePage } from "./pages/ClientProfilePage";
import { ClientProjectsPage } from "./pages/ClientProjectsPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignupPage, SignupRoute } from "./pages/SignupPage";
import { EngineerDashboardLayout } from "./components/dashboard/EngineerDashboardLayout";
import { EngineerMarketplacePage } from "./pages/EngineerMarketplacePage";
import { EngineerOverviewPage } from "./pages/EngineerOverviewPage";
import { EngineerProjectsPage } from "./pages/EngineerProjectsPage";
import { ProjectProgressPage } from "./pages/ProjectProgressPage";
import { PostProjectPage } from "./pages/PostProjectPage";

function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup/client" element={<SignupPage role="client" />} />
      <Route path="/signup/engineer" element={<SignupPage role="engineer" />} />
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
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<EngineerOverviewPage />} />
        <Route path="projects" element={<EngineerProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectProgressPage />} />
        <Route path="marketplace" element={<EngineerMarketplacePage />} />
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
        <Route path="post-project" element={<PostProjectPage />} />
        <Route path="bids" element={<ClientBidsPage />} />
        <Route path="profile" element={<ClientProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
