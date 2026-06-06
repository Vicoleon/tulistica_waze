import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Public / marketing
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Onboarding from "./pages/Onboarding";

// Authenticated app pages
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Stores from "./pages/Stores";
import Products from "./pages/Products";
import ShoppingLists from "./pages/ShoppingLists";
import ListDetail from "./pages/ListDetail";
import ShoppingMode from "./pages/ShoppingMode";
import Scanner from "./pages/Scanner";
import Optimize from "./pages/Optimize";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import MapView from "./pages/MapView";
import PriceAlerts from "./pages/PriceAlerts";
import Budget from "./pages/Budget";
import SeasonalDeals from "./pages/SeasonalDeals";

// Brand portal (c02ee38 implementation)
import BrandLogin from "./pages/brand/BrandLogin";
import BrandRegister from "./pages/brand/BrandRegister";
import BrandVerifyEmail from "./pages/brand/BrandVerifyEmail";
import BrandForgotPassword from "./pages/brand/BrandForgotPassword";
import BrandResetPassword from "./pages/brand/BrandResetPassword";
import BrandDashboard from "./pages/brand/BrandDashboard";
import BrandCampaigns from "./pages/brand/BrandCampaigns";
import BrandCampaignNew from "./pages/brand/BrandCampaignNew";
import BrandCampaignDetail from "./pages/brand/BrandCampaignDetail";
import BrandBilling from "./pages/brand/BrandBilling";
import BrandSettings from "./pages/brand/BrandSettings";

function Router() {
  return (
    <Switch>
      {/* Public routes — render their own marketing chrome. */}
      <Route path="/" component={Home} />
      <Route path="/sign-in" component={SignIn} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/login"><Redirect to="/sign-in" /></Route>

      {/* Onboarding — authenticated but lives outside the dashboard shell. */}
      <Route path="/onboarding" component={Onboarding} />

      {/* Brand portal — separate product with its own chrome. */}
      <Route path="/brand" component={BrandLogin} />
      <Route path="/brand/login" component={BrandLogin} />
      <Route path="/brand/register" component={BrandRegister} />
      <Route path="/brand/verify-email" component={BrandVerifyEmail} />
      <Route path="/brand/forgot-password" component={BrandForgotPassword} />
      <Route path="/brand/reset-password" component={BrandResetPassword} />
      <Route path="/brand/dashboard" component={BrandDashboard} />
      <Route path="/brand/campaigns" component={BrandCampaigns} />
      <Route path="/brand/campaigns/new" component={BrandCampaignNew} />
      <Route path="/brand/campaigns/:id" component={BrandCampaignDetail} />
      <Route path="/brand/billing" component={BrandBilling} />
      <Route path="/brand/settings" component={BrandSettings} />

      {/* Authenticated app routes — wrapped in DashboardLayout. */}
      <Route path="/dashboard">
        <DashboardLayout>
          <Dashboard />
        </DashboardLayout>
      </Route>
      <Route path="/stores">
        <DashboardLayout>
          <Stores />
        </DashboardLayout>
      </Route>
      <Route path="/products">
        <DashboardLayout>
          <Products />
        </DashboardLayout>
      </Route>
      <Route path="/lists">
        <DashboardLayout>
          <ShoppingLists />
        </DashboardLayout>
      </Route>
      {/* In-store shopping mode — full-screen, intentionally NOT wrapped in
          DashboardLayout. Declared before /lists/:id so it wins for /shop. */}
      <Route path="/lists/:id/shop">
        <ShoppingMode />
      </Route>
      <Route path="/lists/:id">
        <DashboardLayout>
          <ListDetail />
        </DashboardLayout>
      </Route>
      <Route path="/scanner">
        <DashboardLayout>
          <Scanner />
        </DashboardLayout>
      </Route>
      <Route path="/optimize">
        <DashboardLayout>
          <Optimize />
        </DashboardLayout>
      </Route>
      <Route path="/pantry">
        <DashboardLayout>
          <Pantry />
        </DashboardLayout>
      </Route>
      <Route path="/recipes">
        <DashboardLayout>
          <Recipes />
        </DashboardLayout>
      </Route>
      <Route path="/leaderboard">
        <DashboardLayout>
          <Leaderboard />
        </DashboardLayout>
      </Route>
      <Route path="/profile">
        <DashboardLayout>
          <Profile />
        </DashboardLayout>
      </Route>
      <Route path="/map">
        <DashboardLayout>
          <MapView />
        </DashboardLayout>
      </Route>
      <Route path="/alerts">
        <DashboardLayout>
          <PriceAlerts />
        </DashboardLayout>
      </Route>
      <Route path="/budget">
        <DashboardLayout>
          <Budget />
        </DashboardLayout>
      </Route>
      <Route path="/seasonal">
        <DashboardLayout>
          <SeasonalDeals />
        </DashboardLayout>
      </Route>
      <Route path="/admin">
        <DashboardLayout>
          <Admin />
        </DashboardLayout>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
