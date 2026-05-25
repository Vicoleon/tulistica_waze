import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, User, MapPin, DollarSign, Clock, Save, LogOut,
  Shield, Award, TrendingUp
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function Profile() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [homeLatitude, setHomeLatitude] = useState("");
  const [homeLongitude, setHomeLongitude] = useState("");
  const [defaultRadius, setDefaultRadius] = useState([10]);
  const [fuelCost, setFuelCost] = useState("0.15");
  const [timeValue, setTimeValue] = useState("15");

  const utils = trpc.useUtils();
  const updateLocation = trpc.user.updateLocation.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  const updatePreferences = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Profile updated!");
    },
  });

  useEffect(() => {
    if (user) {
      setHomeLatitude(user.homeLatitude?.toString() || "");
      setHomeLongitude(user.homeLongitude?.toString() || "");
      setDefaultRadius([user.defaultRadiusKm || 10]);
      setFuelCost(user.fuelCostPerKm?.toString() || "0.15");
      setTimeValue(user.timeValuePerHour?.toString() || "15");
    }
  }, [user]);

  const handleSave = () => {
    if (homeLatitude && homeLongitude) {
      updateLocation.mutate({
        latitude: parseFloat(homeLatitude),
        longitude: parseFloat(homeLongitude),
      });
    }
    updatePreferences.mutate({
      defaultRadiusKm: defaultRadius[0],
      fuelCostPerKm: parseFloat(fuelCost),
      timeValuePerHour: parseFloat(timeValue),
    });
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setHomeLatitude(pos.coords.latitude.toFixed(6));
          setHomeLongitude(pos.coords.longitude.toFixed(6));
          toast.success("Location detected!");
        },
        () => toast.error("Could not get your location")
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const url = getLoginUrl();
    if (url) {
      window.location.href = url;
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          Sign-in isn't configured in this environment.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Profile & Settings</h1>
        </div>
      </header>

      <main className="container py-6 max-w-2xl">
        {/* User Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">
                  {user?.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold">{user?.name || "User"}</h3>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Shield className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.trustScore || 10}</span>
                </div>
                <div className="text-sm text-muted-foreground">Trust Score</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.totalPoints || 0}</span>
                </div>
                <div className="text-sm text-muted-foreground">Total Points</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Award className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.priceReportsCount || 0}</span>
                </div>
                <div className="text-sm text-muted-foreground">Reports</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Home Location
            </CardTitle>
            <CardDescription>
              Set your home location for accurate distance calculations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="40.7128"
                  value={homeLatitude}
                  onChange={(e) => setHomeLatitude(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="-74.0060"
                  value={homeLongitude}
                  onChange={(e) => setHomeLongitude(e.target.value)}
                />
              </div>
            </div>
            <Button variant="outline" onClick={handleGetLocation} className="w-full gap-2">
              <MapPin className="w-4 h-4" /> Use Current Location
            </Button>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Default Search Radius</Label>
                <span className="text-sm text-muted-foreground">{defaultRadius[0]} km</span>
              </div>
              <Slider
                value={defaultRadius}
                onValueChange={setDefaultRadius}
                min={1}
                max={50}
                step={1}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cost Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Cost Preferences
            </CardTitle>
            <CardDescription>
              These values are used to calculate optimal shopping strategies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Fuel Cost per Kilometer
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.15"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time Value per Hour
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="1"
                  placeholder="15"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used to factor in the cost of your time when comparing shopping strategies
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={updateLocation.isPending || updatePreferences.isPending}
            className="flex-1 gap-2"
          >
            <Save className="w-4 h-4" />
            {(updateLocation.isPending || updatePreferences.isPending) ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </main>
    </div>
  );
}
