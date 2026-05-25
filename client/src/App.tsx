import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import BrandLogin from "./pages/brand/BrandLogin";
import BrandDashboard from "./pages/brand/BrandDashboard";
import BrandCampaignNew from "./pages/brand/BrandCampaignNew";
import BrandInsights from "./pages/brand/BrandInsights";
import Stores from "./pages/Stores";
import Products from "./pages/Products";
import ShoppingLists from "./pages/ShoppingLists";
import ListDetail from "./pages/ListDetail";
import Scanner from "./pages/Scanner";
import Optimize from "./pages/Optimize";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import MapView from "./pages/MapView";
import PriceAlerts from "./pages/PriceAlerts";

function Router() {
  return (
    <Switch>
      {/* Public routes — render their own marketing chrome. */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />

      {/* Onboarding — authenticated but lives outside the dashboard shell so
          the user can focus on the 7 questions without sidebar distractions. */}
      <Route path="/onboarding" component={Onboarding} />

      {/* Brand portal (Fase 3) — separate product with its own chrome. */}
      <Route path="/brand/login">
        <BrandLogin initialMode="login" />
      </Route>
      <Route path="/brand/signup">
        <BrandLogin initialMode="signup" />
      </Route>
      <Route path="/brand" component={BrandDashboard} />
      <Route path="/brand/campaigns/new" component={BrandCampaignNew} />
      <Route path="/brand/insights" component={BrandInsights} />

      {/* Authenticated routes — every page lives inside DashboardLayout so
          the sidebar IA, top bar, and breadcrumbs are always available. */}
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
