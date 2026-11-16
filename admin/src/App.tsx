import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { AccountPage } from "./pages/AccountPage";
import { ActivityPage } from "./pages/ActivityPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { EntitiesPage } from "./pages/EntitiesPage";
import { FlowBuilderPage } from "./pages/FlowBuilderPage";
import { FlowsOverviewPage } from "./pages/FlowsOverviewPage";
import { GeneralSettingsPage } from "./pages/GeneralSettingsPage";
import { HomePage } from "./pages/HomePage";
import { LocationsPage } from "./pages/LocationsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProductSetsPage } from "./pages/ProductSetsPage";
import { SellersPage } from "./pages/SellersPage";
import { UsersPage } from "./pages/UsersPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="login-page muted">Laden…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="entities" element={<EntitiesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<GeneralSettingsPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="sellers" element={<SellersPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="new-flow" element={<FlowsOverviewPage />} />
        <Route path="new-flow/:id" element={<FlowBuilderPage />} />
        <Route path="product-sets" element={<ProductSetsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
