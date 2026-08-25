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
import { EngineerBidsPage } from "./pages/EngineerBidsPage";
import { EngineerOverviewPage } from "./pages/EngineerOverviewPage";
import { EngineerProjectsPage } from "./pages/EngineerProjectsPage";
import { EngineerProfilePage } from "./pages/EngineerProfilePage";
import { MyNetworkPage } from "./pages/MyNetworkPage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { ProjectProgressPage } from "./pages/ProjectProgressPage";
import { PostProjectPage } from "./pages/PostProjectPage";
import { ConversationListPage } from "./pages/ConversationListPage";
import { ChatPage } from "./pages/ChatPage";
import { SearchEngineersPage } from "./pages/SearchEngineersPage";
import { FeedPage } from "./pages/FeedPage";
import { NotificationsPage } from "./pages/NotificationsPage";

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
        <Route path="bids" element={<EngineerBidsPage />} />
        <Route path="network" element={<MyNetworkPage />} />
        <Route path="profile" element={<EngineerProfilePage />} />
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
        <Route path="network" element={<MyNetworkPage />} />
        <Route path="profile" element={<ClientProfilePage />} />
      </Route>
      <Route
        path="/users/:userId"
        element={
          <ProtectedRoute>
            <PublicProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:userId"
        element={
          <ProtectedRoute>
            <PublicProfilePage />
          </ProtectedRoute>
        }
      />
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
        path="/messages"
        element={
          <ProtectedRoute>
            <ConversationListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages/:targetId"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
