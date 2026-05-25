import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
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
import Budget from "./pages/Budget";
import SeasonalDeals from "./pages/SeasonalDeals";
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
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/stores" component={Stores} />
      <Route path="/products" component={Products} />
      <Route path="/lists" component={ShoppingLists} />
      <Route path="/lists/:id" component={ListDetail} />
      <Route path="/scanner" component={Scanner} />
      <Route path="/optimize" component={Optimize} />
      <Route path="/pantry" component={Pantry} />
      <Route path="/recipes" component={Recipes} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/profile" component={Profile} />
      <Route path="/map" component={MapView} />
      <Route path="/alerts" component={PriceAlerts} />
      <Route path="/budget" component={Budget} />
      <Route path="/seasonal" component={SeasonalDeals} />

      {/* Brand portal */}
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
