import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandLogin() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/sign-in?returnTo=/brand/dashboard", { replace: true });
  }, [navigate]);
  return null;
}
