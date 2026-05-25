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
import SignIn from "./pages/SignIn";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";

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
      <Route path="/signin" component={SignIn} />
      <Route path="/signup" component={SignIn} />
      <Route path="/legal/terms" component={Terms} />
      <Route path="/legal/privacy" component={Privacy} />
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
