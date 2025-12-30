import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Assets from "./pages/Assets";
import AssetDetails from "./pages/AssetDetails";
import Subscriptions from "./pages/Subscriptions";
import Payments from "./pages/Payments";
import Logs from "./pages/Logs";
import StripeIntegration from "./pages/StripeIntegration";
import PaymentGatewaysSettings from "./pages/PaymentGatewaysSettings";
import Integrations from "./pages/Integrations";
import BillingIntegration from "./pages/BillingIntegration";
import Settings from "./pages/Settings";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import WebhooksSettings from "./pages/WebhooksSettings";
import WebhookLogs from "./pages/WebhookLogs";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<Auth />} />
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    <Route
      path="/clients"
      element={
        <ProtectedRoute>
          <Clients />
        </ProtectedRoute>
      }
    />
    <Route
      path="/assets"
      element={
        <ProtectedRoute>
          <Assets />
        </ProtectedRoute>
      }
    />
    <Route
      path="/assets/:id"
      element={
        <ProtectedRoute>
          <AssetDetails />
        </ProtectedRoute>
      }
    />
    <Route
      path="/subscriptions"
      element={
        <ProtectedRoute>
          <Subscriptions />
        </ProtectedRoute>
      }
    />
    <Route
      path="/payments"
      element={
        <ProtectedRoute>
          <Payments />
        </ProtectedRoute>
      }
    />
    <Route
      path="/logs"
      element={
        <ProtectedRoute>
          <Logs />
        </ProtectedRoute>
      }
    />
    <Route
      path="/stripe-integration"
      element={
        <ProtectedRoute>
          <StripeIntegration />
        </ProtectedRoute>
      }
    />
    <Route
      path="/payment-gateways"
      element={
        <ProtectedRoute>
          <PaymentGatewaysSettings />
        </ProtectedRoute>
      }
    />
    <Route
      path="/integrations"
      element={
        <ProtectedRoute>
          <Integrations />
        </ProtectedRoute>
      }
    />
    <Route
      path="/integrations/billing"
      element={
        <ProtectedRoute>
          <BillingIntegration />
        </ProtectedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      }
    />
    <Route path="/checkout/:assetId" element={<Checkout />} />
    <Route path="/checkout/success" element={<CheckoutSuccess />} />
    <Route
      path="/integrations/webhooks"
      element={
        <ProtectedRoute>
          <WebhooksSettings />
        </ProtectedRoute>
      }
    />
    <Route
      path="/integrations/webhooks/:id/logs"
      element={
        <ProtectedRoute>
          <WebhookLogs />
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;